import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// ============================================
// OFFLINE QUEUE TYPES
// ============================================

export type QueueActionType = 'CREATE_RUN' | 'UPDATE_RUN' | 'DELETE_RUN' | 'CREATE_POST' | 'LIKE_POST' | 'UNLIKE_POST';

export interface QueueItem<T = unknown> {
  id: string;
  type: QueueActionType;
  payload: T;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
}

type ActionHandler<T = unknown> = (payload: T) => Promise<{ success: boolean; error?: string }>;

const QUEUE_STORAGE_KEY = '@runner:offline_queue';
const MAX_RETRIES = 3;

// ============================================
// OFFLINE QUEUE CLASS
// ============================================

class OfflineQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private isInitialized = false;
  private handlers: Map<QueueActionType, ActionHandler> = new Map();
  private listeners: Set<() => void> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;

  // Don't do anything in constructor - wait for init()
  constructor() {}

  /**
   * Initialize the queue (call on app start)
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.loadQueue();
      this.setupNetworkListener();
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing offline queue:', error);
    }
  }

  /**
   * Register a handler for a specific action type
   */
  registerHandler<T>(type: QueueActionType, handler: ActionHandler<T>): void {
    this.handlers.set(type, handler as ActionHandler);
  }

  /**
   * Add an item to the queue
   */
  async enqueue<T>(type: QueueActionType, payload: T): Promise<string> {
    const item: QueueItem<T> = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: MAX_RETRIES,
    };

    this.queue.push(item as QueueItem);
    await this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    this.processQueue();

    return item.id;
  }

  /**
   * Remove an item from the queue
   */
  async dequeue(id: string): Promise<void> {
    this.queue = this.queue.filter(item => item.id !== id);
    await this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Get all pending items
   */
  getPendingItems(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * Get count of pending items
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Check if there are pending items
   */
  hasPendingItems(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Process all items in the queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    // Check network connectivity
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('Offline - queue processing deferred');
      return;
    }

    this.isProcessing = true;

    try {
      // Process items in order (FIFO)
      const itemsToProcess = [...this.queue];

      for (const item of itemsToProcess) {
        const handler = this.handlers.get(item.type);

        if (!handler) {
          console.warn(`No handler registered for action type: ${item.type}`);
          continue;
        }

        try {
          const result = await handler(item.payload);

          if (result.success) {
            // Remove successful item
            await this.dequeue(item.id);
            console.log(`Queue item processed successfully: ${item.id}`);
          } else {
            // Handle failure
            item.retryCount++;

            if (item.retryCount >= item.maxRetries) {
              // Max retries reached, remove from queue
              console.error(`Queue item failed after ${item.maxRetries} retries: ${item.id}`, result.error);
              await this.dequeue(item.id);
            } else {
              // Save updated retry count
              await this.saveQueue();
              console.log(`Queue item will be retried (${item.retryCount}/${item.maxRetries}): ${item.id}`);
            }
          }
        } catch (error) {
          console.error(`Error processing queue item: ${item.id}`, error);
          item.retryCount++;

          if (item.retryCount >= item.maxRetries) {
            await this.dequeue(item.id);
          } else {
            await this.saveQueue();
          }
        }
      }
    } finally {
      this.isProcessing = false;
      this.notifyListeners();
    }
  }

  /**
   * Clear all items from the queue
   */
  async clear(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Cleanup (call on app shutdown)
   */
  cleanup(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.listeners.clear();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading offline queue:', error);
      this.queue = [];
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Error saving offline queue:', error);
    }
  }

  private setupNetworkListener(): void {
    if (this.unsubscribeNetInfo) {
      return;
    }

    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      if (state.isConnected && this.queue.length > 0) {
        console.log('Network connected - processing offline queue');
        this.processQueue();
      }
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueue();
