import {test, expect} from 'bun:test';
import {createConfirmedPersistence, cacheConfirmedSettings, type PersistenceStatus} from '../src/settings/confirmedPersistence';
const deferred = () => { let resolve!: () => void; let reject!: (e: Error) => void; const promise = new Promise<void>((yes, no) => {resolve=yes; reject=no;}); return {promise, resolve, reject}; };

test('failure leaves rendered state and local cache at their confirmed values, retry commits once', async () => {
    let status: PersistenceStatus = {pending:0, failures:[]};
    const persistence = createConfirmedPersistence(next => {status=next;});
    let state = 'old'; const storage = new Map([['setting','old']]); let fail=true;
    const result=await persistence.run('setting', async () => {if(fail) throw new Error('disk full');}, () => {state='new'; storage.set('setting','new');});
    expect(result).toBe(false); expect(state).toBe('old'); expect(storage.get('setting')).toBe('old'); expect(status.pending).toBe(0); expect(status.failures[0].message).toBe('disk full');
    fail=false; await status.failures[0].retry(); expect(state).toBe('new'); expect(storage.get('setting')).toBe('new'); expect(status.failures).toEqual([]);
});
test('no apply or broadcast callback until IPC completes', async () => {
    const wait=deferred(); let commits=0; let pending=0;
    const persistence=createConfirmedPersistence(s => {pending=s.pending;});
    const result=persistence.run('key', () => wait.promise, () => {commits++;});
    await Promise.resolve(); expect(pending).toBe(1); expect(commits).toBe(0);
    wait.resolve(); expect(await result).toBe(true); expect(commits).toBe(1); expect(pending).toBe(0);
});
test('queued failures cannot roll back a subsequent success or leave obsolete errors', async () => {
    const wait=deferred(); const commits:string[]=[]; const starts:string[]=[];
    let status:PersistenceStatus={pending:0, failures:[]};
    const persistence=createConfirmedPersistence(s => {status=s;});
    const first=persistence.run('key', () => {starts.push('first'); return wait.promise;}, () => commits.push('first'));
    const second=persistence.run('key', async () => {starts.push('second');}, () => commits.push('second'));
    await Promise.resolve(); expect(starts).toEqual(['first']); expect(status.pending).toBe(2);
    wait.reject(new Error('old failure')); await Promise.all([first,second]);
    expect(starts).toEqual(['first','second']); expect(commits).toEqual(['second']); expect(status.failures).toEqual([]);
});
test('later failure preserves earlier confirmed success; unrelated errors remain actionable', async () => {
    let status:PersistenceStatus={pending:0, failures:[]}; let state='initial';
    const persistence=createConfirmedPersistence(s => {status=s;});
    const first=persistence.run('key',async()=>{},()=>{state='confirmed';});
    const second=persistence.run('key',async()=>{throw Error('rejected');},()=>{state='bad';});
    await Promise.all([first,second]); expect(state).toBe('confirmed'); expect(status.failures).toHaveLength(1);
    await persistence.run('other',async()=>{},()=>{}); expect(status.failures).toHaveLength(1);
    persistence.dismiss('key'); expect(status.failures).toEqual([]);
});
test('cache clears nullable keys only for a confirmed transaction', () => {
    const values=new Map([['city','Paris'],['lat','48']]);
    cacheConfirmedSettings({setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}}, {city:null,lat:null,theme:'dark'});
    expect([...values]).toEqual([['theme','dark']]);
});
