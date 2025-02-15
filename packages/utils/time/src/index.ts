export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
    }
}
export const delay = (ms: number, options?: { stopperCallback?: (stopper: () => void) => void }) => {
    return new Promise((res, rej) => {
        if (options?.stopperCallback)
            options?.stopperCallback(() => res(true));
        setTimeout(res, ms)
    })
};


export const waitFor = async <T>(fn: () => T, options: { timeout: number, stopperCallback?: (stopper: () => void) => void, delayInterval: number } = { timeout: 10 * 1000, delayInterval: 50 }): Promise<T | undefined> => {

    let startTime = +new Date;
    let stop = false
    if (options.stopperCallback) {
        const stopper = () => { stop = true }
        options.stopperCallback(stopper);
    }
    while (+new Date - startTime < options.timeout) {
        if (stop) {
            return;
        }
        const result = fn();
        if (result) {
            return result;
        }
        await delay(options.delayInterval);

    }
    throw new TimeoutError("Timed out")

};

export const waitForAsync = async<T>(fn: () => Promise<T>, options: { timeout: number, stopperCallback?: (stopper: () => void) => void, delayInterval: number } = { timeout: 10 * 1000, delayInterval: 50 }): Promise<T | undefined> => {

    let startTime = +new Date;
    let stop = false
    if (options.stopperCallback) {
        const stopper = () => { stop = true }
        options.stopperCallback(stopper);
    }
    while (+new Date - startTime < options.timeout) {
        if (stop) {
            return;
        }
        const result = await fn();
        if (result) {
            return result;
        }
        await delay(options.delayInterval);
    }
    throw new TimeoutError("Timed out")
};
