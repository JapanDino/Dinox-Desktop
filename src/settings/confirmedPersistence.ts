export type SettingValues = Record<string, string | null>;
export interface PersistenceFailure { id: string; message: string; retry: () => Promise<boolean> }
export interface PersistenceStatus { pending: number; failures: PersistenceFailure[] }

/** Keep disk, cache and rendered controls in commit order. No optimistic broadcasts. */
export function createConfirmedPersistence(
    notify: (status: PersistenceStatus) => void,
) {
    let queue: Promise<unknown> = Promise.resolve();
    let pending = 0;
    const failures = new Map<string, PersistenceFailure>();
    const revisions = new Map<string, number>();
    const publish = () => notify({ pending, failures: [...failures.values()] });
    const run = (id: string, operation: () => Promise<void>, confirmed: () => void): Promise<boolean> => {
        const revision = (revisions.get(id) ?? 0) + 1;
        revisions.set(id, revision);
        pending++;
        publish();
        const result = queue.then(async () => {
            try {
                await operation();
                confirmed();
                if (revisions.get(id) === revision) failures.delete(id);
                return true;
            } catch (error) {
                if (revisions.get(id) === revision) failures.set(id, {
                    id,
                    message: error instanceof Error ? error.message : String(error),
                    retry: () => run(id, operation, confirmed),
                });
                return false;
            } finally { pending--; publish(); }
        });
        // A failed operation cannot break or reorder subsequent saves.
        queue = result;
        return result;
    };
    return {
        run,
        dismiss: (id: string) => { failures.delete(id); publish(); },
    };
}

export function cacheConfirmedSettings(storage: Pick<Storage, 'setItem' | 'removeItem'>, values: SettingValues) {
    for (const [key, value] of Object.entries(values)) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
    }
}
