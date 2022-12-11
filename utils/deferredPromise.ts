interface DeferredPromiseImpl<T> {
    resolve: (...args: T extends void ? never[] : [value: T | PromiseLike<T>]) => void
    reject: (err?: unknown) => void
    promise: Promise<T>
}

export function createDeferredPromise<T = void>() {
    let resolve: unknown
    let reject: unknown
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })

    return { resolve, reject, promise } as DeferredPromiseImpl<T>
}
