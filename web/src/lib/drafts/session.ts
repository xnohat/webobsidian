import type { DraftRecord, DraftKey } from './types';
export type SaveState = 'modified' | 'saving' | 'local' | 'saved' | 'conflict' | 'error';
interface IO {
    put: (r: DraftRecord) => Promise<void>;
    remove: (key: DraftKey, revision: number) => Promise<boolean>;
    write: (path: string, content: string, version: string) => Promise<{
        version?: string;
    }>;
}
export class DocumentSession {
    readonly key: DraftKey;
    content: string;
    baseContent: string;
    baseVersion: string;
    revision = 0;
    state: SaveState = 'saved';
    localError = '';
    private timer: ReturnType<typeof setTimeout> | undefined;
    private started = 0;
    private acknowledgementGeneration=0;
    private pending: Promise<void> = Promise.resolve();
    constructor(input: DraftKey & {
        content: string;
        version: string;
    }, private io: IO, private changed: () => void = () => { }) { this.key = { scopeId: input.scopeId, path: input.path, writerId: input.writerId }; this.content = this.baseContent = input.content; this.baseVersion = input.version; }
    record(): DraftRecord { return { ...this.key, schemaVersion: 1, revision: this.revision, updatedAt: Date.now(), baseContent: this.baseContent, baseVersion: this.baseVersion, content: this.content, kind: /\.canvas$/i.test(this.key.path) ? 'canvas' : 'text', state: this.state === 'conflict' ? 'conflict' : 'dirty' }; }
    edit(content: string) { this.content = content; this.revision++; if (this.state !== 'conflict')
        this.state = 'modified'; this.changed(); clearTimeout(this.timer); if (!this.started)
        this.started = Date.now(); this.timer = setTimeout(() => { void this.flush().catch(() => { }); }, Math.min(150, Math.max(0, 1000 - (Date.now() - this.started)))); }
    async flush() {
        clearTimeout(this.timer);
        this.started = 0;
        const record = this.record();
        const task = this.pending.catch(() => { }).then(() => this.io.put(record));
        this.pending = task;
        try {
            await task;
            this.localError = '';
            if (this.revision === record.revision && this.state !== 'conflict' && this.state !== 'saved' && this.state !== 'saving')
                this.state = 'local';
        }
        catch (error) {
            this.localError = String(error);
            if (this.state !== 'conflict')
                this.state = 'error';
            throw error;
        }
        finally {
            this.changed();
        }
    }
    async save() {
        if (this.state === 'conflict')
            throw new Error('Resolve conflict before saving');
        const acknowledgement=this.acknowledgementGeneration;
        const snapshot = this.record();
        try {
            await this.flush();
        }
        catch { /* Server save remains available after local storage failure. */ }
        if(acknowledgement!==this.acknowledgementGeneration)return;
        this.state = 'saving';
        this.changed();
        try {
            const result = await this.io.write(this.key.path, snapshot.content, snapshot.baseVersion);
            if(acknowledgement!==this.acknowledgementGeneration)return;
            if (!result.version)
                throw new Error('Server did not return a content version');
            this.baseContent = snapshot.content;
            this.baseVersion = result.version;
            if (this.revision === snapshot.revision) {
                await this.pending.catch(() => { });
                if(acknowledgement!==this.acknowledgementGeneration)return;
                try {
                    await this.io.remove(this.key, snapshot.revision);
                }
                catch (error) {
                    this.localError = String(error);
                }
                if(acknowledgement!==this.acknowledgementGeneration)return;
                if(this.revision===snapshot.revision){this.state='saved';}else{this.state='modified';await this.flush().catch(()=>{});}
            }
            else {
                this.state = 'modified';
                await this.flush().catch(() => { });
            }
        }
        catch (error) {
            if(acknowledgement!==this.acknowledgementGeneration)return;
            this.state = (error as {
                status?: number;
            }).status === 409 ? 'conflict' : 'error';
            await this.flush().catch(() => { });
            throw error;
        }
        finally {
            this.changed();
        }
    }
    acceptServerResult(content:string,version:string){this.acknowledgementGeneration++;clearTimeout(this.timer);this.revision++;this.content=this.baseContent=content;this.baseVersion=version;this.state='saved';this.changed();}
    dispose() { clearTimeout(this.timer); }
}
