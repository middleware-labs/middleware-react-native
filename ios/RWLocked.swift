
class RWLocked<T> {
    private var lock: pthread_rwlock_t = pthread_rwlock_t()
    private var guarded: T
    
    init(initialValue: T) {
        pthread_rwlock_init(&lock, nil)
        self.guarded = initialValue
    }
    
    func read() -> T {
        pthread_rwlock_rdlock(&lock)
        defer { pthread_rwlock_unlock(&lock) }
        return guarded
    }
    
    func with_write_access(block: (inout T) -> Void) -> Void {
        pthread_rwlock_wrlock(&lock)
        defer { pthread_rwlock_unlock(&lock) }
        block(&self.guarded)
    }
    
    func write(value: T) {
        pthread_rwlock_wrlock(&lock)
        defer { pthread_rwlock_unlock(&lock) }
        self.guarded = value
    }
}
