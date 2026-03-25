/**
 * State Manager Service
 * Provides persistent state management using IndexedDB for complex data structures,
 * cross-tab synchronization, and session recovery
 */

interface StateSchema {
  version: number;
  stores: {
    [storeName: string]: {
      keyPath: string;
      indexes?: Array<{
        name: string;
        keyPath: string | string[];
        options?: IDBIndexParameters;
      }>;
    };
  };
}

interface StateChange {
  store: string;
  action: 'add' | 'update' | 'delete';
  key: any;
  value?: any;
  timestamp: number;
  tabId?: string;
}

interface SyncMessage {
  type: 'state_sync';
  changes: StateChange[];
  sourceTabId: string;
}

export class StateManager {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'CloudNavigatorState';
  private readonly dbVersion = 2;
  private syncChannel: BroadcastChannel | null = null;
  private tabId: string;
  private changeQueue: StateChange[] = [];
  private syncInterval: number | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private undoStack: StateChange[] = [];
  private redoStack: StateChange[] = [];
  private maxUndoStackSize = 50;

  // Define database schema
  private schema: StateSchema = {
    version: this.dbVersion,
    stores: {
      checklists: {
        keyPath: 'id',
        indexes: [
          { name: 'byProvider', keyPath: 'cloudProvider' },
          { name: 'byStatus', keyPath: 'status' },
          { name: 'byCreatedAt', keyPath: 'createdAt' },
          { name: 'byUpdatedAt', keyPath: 'updatedAt' }
        ]
      },
      deploymentSessions: {
        keyPath: 'id',
        indexes: [
          { name: 'byProjectId', keyPath: 'projectId' },
          { name: 'byStartTime', keyPath: 'startTime' },
          { name: 'byStatus', keyPath: 'status' }
        ]
      },
      userActions: {
        keyPath: 'id',
        indexes: [
          { name: 'byTimestamp', keyPath: 'timestamp' },
          { name: 'byType', keyPath: 'type' },
          { name: 'bySessionId', keyPath: 'sessionId' }
        ]
      },
      domSnapshots: {
        keyPath: 'id',
        indexes: [
          { name: 'byUrl', keyPath: 'url' },
          { name: 'byTimestamp', keyPath: 'timestamp' },
          { name: 'byProvider', keyPath: 'provider' }
        ]
      },
      projectAnalyses: {
        keyPath: 'id',
        indexes: [
          { name: 'byRepoUrl', keyPath: 'repoUrl' },
          { name: 'byTimestamp', keyPath: 'timestamp' }
        ]
      },
      preferences: {
        keyPath: 'key'
      },
      cache: {
        keyPath: 'key',
        indexes: [
          { name: 'byExpiry', keyPath: 'expiresAt' }
        ]
      },
      metrics: {
        keyPath: 'id',
        indexes: [
          { name: 'byType', keyPath: 'type' },
          { name: 'byTimestamp', keyPath: 'timestamp' },
          { name: 'bySessionId', keyPath: 'sessionId' }
        ]
      }
    }
  };

  constructor() {
    this.tabId = this.generateTabId();
    this.initializeDatabase();
    this.initializeSyncChannel();
    this.startSyncInterval();
    this.setupEventListeners();
  }

  /**
   * Initialize IndexedDB database
   */
  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        this.setupTransactionHandlers();
        this.cleanupExpiredCache();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;

        // Create or update stores based on schema
        for (const [storeName, storeConfig] of Object.entries(this.schema.stores)) {
          let store: IDBObjectStore;

          if (!db.objectStoreNames.contains(storeName)) {
            // Create new store
            store = db.createObjectStore(storeName, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.keyPath === 'id'
            });
          } else {
            // Get existing store
            store = transaction.objectStore(storeName);
          }

          // Create indexes
          if (storeConfig.indexes) {
            for (const index of storeConfig.indexes) {
              if (!store.indexNames.contains(index.name)) {
                store.createIndex(
                  index.name,
                  index.keyPath,
                  index.options || { unique: false }
                );
              }
            }
          }
        }

        console.log('Database schema updated to version', this.dbVersion);
      };

      request.onblocked = () => {
        console.warn('Database upgrade blocked. Please close other tabs.');
      };
    });
  }

  /**
   * Setup transaction event handlers
   */
  private setupTransactionHandlers(): void {
    if (!this.db) return;

    this.db.onerror = (event) => {
      console.error('Database error:', event);
    };

    this.db.onabort = (event) => {
      console.error('Transaction aborted:', event);
    };

    this.db.onclose = () => {
      console.log('Database connection closed');
      this.db = null;
      // Attempt to reconnect
      setTimeout(() => this.initializeDatabase(), 1000);
    };
  }

  /**
   * Initialize BroadcastChannel for cross-tab sync
   */
  private initializeSyncChannel(): void {
    try {
      this.syncChannel = new BroadcastChannel('cloud-navigator-sync');

      this.syncChannel.onmessage = (event) => {
        const message = event.data as SyncMessage;
        if (message.type === 'state_sync' && message.sourceTabId !== this.tabId) {
          this.handleRemoteChanges(message.changes);
        }
      };

      console.log('Sync channel initialized');
    } catch (error) {
      console.warn('BroadcastChannel not available, falling back to storage events');
      this.setupStorageSyncFallback();
    }
  }

  /**
   * Fallback sync using storage events
   */
  private setupStorageSyncFallback(): void {
    window.addEventListener('storage', (event) => {
      if (event.key === 'cloud-navigator-sync' && event.newValue) {
        try {
          const message = JSON.parse(event.newValue) as SyncMessage;
          if (message.sourceTabId !== this.tabId) {
            this.handleRemoteChanges(message.changes);
          }
        } catch (error) {
          console.error('Failed to parse sync message:', error);
        }
      }
    });
  }

  /**
   * Start periodic sync interval
   */
  private startSyncInterval(): void {
    this.syncInterval = window.setInterval(() => {
      this.flushChangeQueue();
      this.cleanupExpiredCache();
    }, 5000);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for page unload to flush changes
    window.addEventListener('beforeunload', () => {
      this.flushChangeQueue();
    });

    // Listen for visibility changes to sync when tab becomes active
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.syncWithRemote();
      }
    });
  }

  /**
   * Generate unique tab ID
   */
  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get data from store
   */
  public async get<T>(storeName: string, key: any): Promise<T | null> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          console.error(`Failed to get ${key} from ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Transaction failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Get all data from store
   */
  public async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result || []);
        };

        request.onerror = () => {
          console.error(`Failed to get all from ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Transaction failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Query data using index
   */
  public async query<T>(
    storeName: string,
    indexName: string,
    query?: IDBKeyRange | any,
    limit?: number
  ): Promise<T[]> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const results: T[] = [];

        const request = query ? index.openCursor(query) : index.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor && (!limit || results.length < limit)) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => {
          console.error(`Failed to query ${storeName}.${indexName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Query failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Set data in store
   */
  public async set<T>(storeName: string, value: T, key?: any): Promise<any> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = key !== undefined ? store.put(value, key) : store.put(value);

        request.onsuccess = () => {
          const change: StateChange = {
            store: storeName,
            action: 'update',
            key: request.result,
            value: value,
            timestamp: Date.now(),
            tabId: this.tabId
          };

          this.recordChange(change);
          this.notifyListeners(storeName, change);
          resolve(request.result);
        };

        request.onerror = () => {
          console.error(`Failed to set data in ${storeName}:`, request.error);
          reject(request.error);
        };

        transaction.onerror = () => {
          console.error('Transaction failed:', transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error('Set operation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Add data to store
   */
  public async add<T>(storeName: string, value: T): Promise<any> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(value);

        request.onsuccess = () => {
          const change: StateChange = {
            store: storeName,
            action: 'add',
            key: request.result,
            value: value,
            timestamp: Date.now(),
            tabId: this.tabId
          };

          this.recordChange(change);
          this.notifyListeners(storeName, change);
          resolve(request.result);
        };

        request.onerror = () => {
          console.error(`Failed to add data to ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Add operation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Delete data from store
   */
  public async delete(storeName: string, key: any): Promise<void> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          const change: StateChange = {
            store: storeName,
            action: 'delete',
            key: key,
            timestamp: Date.now(),
            tabId: this.tabId
          };

          this.recordChange(change);
          this.notifyListeners(storeName, change);
          resolve();
        };

        request.onerror = () => {
          console.error(`Failed to delete ${key} from ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Delete operation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Clear all data from store
   */
  public async clear(storeName: string): Promise<void> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          console.log(`Cleared store: ${storeName}`);
          resolve();
        };

        request.onerror = () => {
          console.error(`Failed to clear ${storeName}:`, request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Clear operation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Batch operations for better performance
   */
  public async batch(operations: Array<{
    store: string;
    action: 'add' | 'put' | 'delete';
    value?: any;
    key?: any;
  }>): Promise<void> {
    if (!this.db) await this.initializeDatabase();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      try {
        const storeNames = [...new Set(operations.map(op => op.store))];
        const transaction = this.db!.transaction(storeNames, 'readwrite');
        const changes: StateChange[] = [];

        for (const op of operations) {
          const store = transaction.objectStore(op.store);

          let request: IDBRequest;
          switch (op.action) {
            case 'add':
              request = store.add(op.value);
              break;
            case 'put':
              request = op.key !== undefined
                ? store.put(op.value, op.key)
                : store.put(op.value);
              break;
            case 'delete':
              request = store.delete(op.key);
              break;
          }

          request.onsuccess = () => {
            changes.push({
              store: op.store,
              action: op.action === 'put' ? 'update' : op.action,
              key: op.key || request.result,
              value: op.value,
              timestamp: Date.now(),
              tabId: this.tabId
            });
          };

          request.onerror = () => {
            console.error(`Batch operation failed:`, request.error);
          };
        }

        transaction.oncomplete = () => {
          changes.forEach(change => {
            this.recordChange(change);
            this.notifyListeners(change.store, change);
          });
          resolve();
        };

        transaction.onerror = () => {
          console.error('Batch transaction failed:', transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error('Batch operation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Cache data with expiry
   */
  public async cache(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    const expiresAt = Date.now() + (ttlSeconds * 1000);

    await this.set('cache', {
      key,
      value,
      expiresAt,
      createdAt: Date.now()
    });
  }

  /**
   * Get cached data
   */
  public async getCached(key: string): Promise<any> {
    const cached = await this.get<any>('cache', key);

    if (!cached) return null;

    if (cached.expiresAt < Date.now()) {
      await this.delete('cache', key);
      return null;
    }

    return cached.value;
  }

  /**
   * Cleanup expired cache entries
   */
  private async cleanupExpiredCache(): Promise<void> {
    if (!this.db) return;

    try {
      const now = Date.now();
      const expiredKeys: string[] = [];

      const transaction = this.db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('byExpiry');
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          expiredKeys.push(cursor.value.key);
          store.delete(cursor.value.key);
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        if (expiredKeys.length > 0) {
          console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
        }
      };
    } catch (error) {
      console.error('Cache cleanup failed:', error);
    }
  }

  /**
   * Record change for undo/sync
   */
  private recordChange(change: StateChange): void {
    // Add to change queue for sync
    this.changeQueue.push(change);

    // Add to undo stack
    this.undoStack.push(change);
    if (this.undoStack.length > this.maxUndoStackSize) {
      this.undoStack.shift();
    }

    // Clear redo stack on new action
    this.redoStack = [];

    // Broadcast change if queue is getting large
    if (this.changeQueue.length >= 10) {
      this.flushChangeQueue();
    }
  }

  /**
   * Flush change queue and broadcast
   */
  private flushChangeQueue(): void {
    if (this.changeQueue.length === 0) return;

    const changes = [...this.changeQueue];
    this.changeQueue = [];

    // Broadcast via BroadcastChannel
    if (this.syncChannel) {
      this.syncChannel.postMessage({
        type: 'state_sync',
        changes: changes,
        sourceTabId: this.tabId
      } as SyncMessage);
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem('cloud-navigator-sync', JSON.stringify({
          type: 'state_sync',
          changes: changes,
          sourceTabId: this.tabId
        }));
      } catch (error) {
        console.error('Failed to sync via localStorage:', error);
      }
    }
  }

  /**
   * Handle remote changes
   */
  private async handleRemoteChanges(changes: StateChange[]): Promise<void> {
    for (const change of changes) {
      // Apply change to local database
      if (change.action === 'delete') {
        await this.delete(change.store, change.key);
      } else {
        await this.set(change.store, change.value, change.key);
      }

      // Notify local listeners
      this.notifyListeners(change.store, change);
    }
  }

  /**
   * Sync with remote tabs
   */
  private async syncWithRemote(): Promise<void> {
    // Request sync from other tabs
    if (this.syncChannel) {
      this.syncChannel.postMessage({
        type: 'sync_request',
        sourceTabId: this.tabId
      });
    }
  }

  /**
   * Subscribe to store changes
   */
  public subscribe(storeName: string, callback: Function): () => void {
    if (!this.listeners.has(storeName)) {
      this.listeners.set(storeName, new Set());
    }

    this.listeners.get(storeName)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(storeName);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(storeName: string, change: StateChange): void {
    const listeners = this.listeners.get(storeName);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(change);
        } catch (error) {
          console.error('Listener error:', error);
        }
      });
    }
  }

  /**
   * Undo last action
   */
  public async undo(): Promise<boolean> {
    if (this.undoStack.length === 0) return false;

    const change = this.undoStack.pop()!;
    this.redoStack.push(change);

    // Reverse the change
    if (change.action === 'add') {
      await this.delete(change.store, change.key);
    } else if (change.action === 'delete') {
      await this.set(change.store, change.value, change.key);
    } else {
      // For updates, we'd need the previous value
      // This is simplified - in production, store previous values
      console.warn('Undo for updates not fully implemented');
    }

    return true;
  }

  /**
   * Redo last undone action
   */
  public async redo(): Promise<boolean> {
    if (this.redoStack.length === 0) return false;

    const change = this.redoStack.pop()!;
    this.undoStack.push(change);

    // Reapply the change
    if (change.action === 'delete') {
      await this.delete(change.store, change.key);
    } else {
      await this.set(change.store, change.value, change.key);
    }

    return true;
  }

  /**
   * Export all data
   */
  public async exportData(): Promise<any> {
    const data: any = {};

    for (const storeName of Object.keys(this.schema.stores)) {
      data[storeName] = await this.getAll(storeName);
    }

    return {
      version: this.dbVersion,
      exportedAt: Date.now(),
      tabId: this.tabId,
      data
    };
  }

  /**
   * Import data
   */
  public async importData(exportedData: any): Promise<void> {
    if (exportedData.version !== this.dbVersion) {
      console.warn('Version mismatch during import');
    }

    const operations: any[] = [];

    for (const [storeName, items] of Object.entries(exportedData.data)) {
      if (Array.isArray(items)) {
        for (const item of items) {
          operations.push({
            store: storeName,
            action: 'put',
            value: item
          });
        }
      }
    }

    await this.batch(operations);
    console.log(`Imported ${operations.length} items`);
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<any> {
    const stats: any = {
      stores: {},
      totalSize: 0
    };

    for (const storeName of Object.keys(this.schema.stores)) {
      const items = await this.getAll(storeName);
      stats.stores[storeName] = {
        count: items.length,
        size: JSON.stringify(items).length
      };
      stats.totalSize += stats.stores[storeName].size;
    }

    return stats;
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    // Flush pending changes
    this.flushChangeQueue();

    // Clear intervals
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Close broadcast channel
    if (this.syncChannel) {
      this.syncChannel.close();
      this.syncChannel = null;
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // Clear listeners
    this.listeners.clear();

    console.log('StateManager destroyed');
  }
}

// Export singleton instance
export const stateManager = new StateManager();