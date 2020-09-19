/*
2020-09-19 Kristján Hall

An indexedDB wrapper
*/

interface StoreColumn {
    name: string,
    unique: boolean
}

interface StoreSchema {
    name: string,
    primaryKey: string,
    columns: Array<StoreColumn>
}


/**
 * Creates a database store based on the given schema
 * @param database a indexedDB database instance
 * @param store a store schema
 * 
 * Returns an Promise<object> containing CRUD actions for the store
 */
async function dbStore(database: IDBDatabase, store: StoreSchema) {
    const objectStore = database.createObjectStore(
        store.name,
        { keyPath: store.primaryKey }
    );
    /**
     * Opens a db transaction for the store in question
     * @param mode readwrite, readonly, versionchange
     * 
     * Returns an Promise<IDBTransaction> instance.
     */
    const getTransaction = async (
        mode: IDBTransactionMode = "readwrite"
    ): Promise<IDBTransaction> => {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(store.name, mode);

            transaction.onerror = () => {
                throw new Error(transaction.error.message);
            }
            transaction.oncomplete = () => {
                resolve(transaction);
            }
            transaction.abort = () => {
                const error = transaction.error.message;
                if (error) throw new Error(transaction.error.message);
                reject('Transaction aborted');
            }
        })
    }
    /**
     * Opens a db transaction an initializes a object store on that transaction
     * @param mode readwrite, readonly, versionchange
     * 
     * Returns a Promise<IDBObjectStore> instance
     */
    const getObjectStore = async (
        mode: IDBTransactionMode = "readonly"
    ): Promise<IDBObjectStore> => {
        return new Promise(async (resolve) => {
            const transaction = await getTransaction(mode);
            
            resolve(transaction.objectStore(name))
        });
    }
    /**
     * Initializes an IDBObjectStore and performs some action on it
     * @param action string - the name of an action (on an IDBObjectStore)
     * @param mode string - readwrite, readonly, versionchange
     * @param payload optional - a payload to pass to the action
     * 
     * Returns a Promise<IDBRequest.result>
     */
    const deferedAction = (action: string, mode: IDBTransactionMode, payload?: any) => {
        return new Promise(async (resolve, reject) => {
            const objectStore = await getObjectStore("readwrite");
            const request = objectStore[action](payload);

            request.onerror = () => {
                throw new Error(`Could not perform ${action} on ${store.name}`);
            }
            
            request.onsuccess = () => {
                resolve(request.result);
            }
        })
    }

    store.columns.forEach(({name, unique}) => 
            objectStore.createIndex(name, name, { unique }));

    return {
        async add(data: {[key: string]: any} | null) {
            await deferedAction('put', "readwrite", data);
        },

        async get(key: string) {
            return await deferedAction('get', "readwrite");
        },

        async getAll() {
            return await deferedAction('getAll', "readonly");
        },

        async getAllKeys() {
            return await deferedAction('getAllKeys', "readonly");
        },

        async remove(key: string) {
            return await deferedAction('delete', "readwrite", key);
        },

        async count(key: string) {
            const objectStore = await getObjectStore("readonly");

            return new Promise((resolve, reject) => {
                const index = objectStore.index(key);
                const request = index.count();

                request.onerror = () => {
                    reject(request.error.message);
                }

                request.onsuccess = () => {
                    resolve(request.result);
                }
            })
        },

        async clear() {
            return await deferedAction('clear', "readwrite");
        }
    }
}


/**
 * This function is run when a database is opened for the first time or is
 * of a version is higher than an existing version.
 * @param database an indexedDB database instance
 * @param schema the schema for the database
 * 
 * Returns an Promise<objec> of stores from the schema, each having CRUD
 * actions of it's own
 */
async function upgradeDB(database: IDBDatabase, schema: Array<StoreSchema>) {
    return new Promise((resolve, reject) => {
        database.onerror = () => {
            throw new Error(`Could not upgrade database`);
        }
        
        database.onabort = () => {
            reject('Upgrade aborted!');
        }

        const stores = schema.reduce((p, store) => ({
            ...p,
            [store.name]: dbStore(database, store)
        }), {})

        resolve(stores);
    });
}

/**
 * Initialize a database connection. If database does not exists (or version is
 * newer than) the version stored an upgrade function will run with
 * initializing the stores accoring to the schema
 * @param databaseName Name of the indexedDB database
 * @param version Version of the indexedDB database
 * @param schema The schema for the stores in the database
 * 
 * Returns an Promise<object> containing all the stores, each with its CRUD
 * like actions.
 * 
 * Todo: Take in an "update" function that is run when the version number is
 * higher than the one in the brower.
 */
async function IDB(databaseName: string, version: number = 1, schema: Array<StoreSchema>) {
    let database = null;

    return new Promise((resolve, reject) => {
        const dbRequest = window.indexedDB.open(databaseName, version);
        
        dbRequest.onerror = () => {
            throw new Error(`Could not open database: ${databaseName} - ${dbRequest.error.message}` )
        };

        dbRequest.onblocked = () => {
            throw new Error('Database cannot be upgraded because older version is still in use somewhere.')
        }

        dbRequest.onsuccess = () => {
            database = dbRequest.result;
        }

        dbRequest.onupgradeneeded = async () => {
            return await upgradeDB(database, schema);
        }
    });
}

export default IDB;