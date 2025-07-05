const sqlite3 = require('sqlite3').verbose();

/**
 * @property value {int}
 * @property name {string}
 */
class Counter {
    constructor(database, name, value) {
        this.database = database;
        this.name = name;
        this.originalValue = value;
        this.value = value;
    }

    /**
     * @returns {Promise<Counter>}
     */
    addOne() {
        return this.add(1);
    }

    /**
     * @param amount {int}
     * @returns {Promise<Counter>}
     */
    add(amount) {
        this.value += amount;
        return this.triggerUpdate()
    }

    /**
     * @returns {Promise<Counter>}
     */
    subOne() {
        return this.subtract(1);
    }

    /**
     * @param amount {int}
     * @returns {Promise<Counter>}
     */
    subtract(amount) {
        this.value -= amount;
        return this.triggerUpdate()
    }

    /**
     * @returns {int}
     */
    get() {
        return this.value
    }

    /**
     * @param amount {int}
     * @returns {Promise<Counter>}
     */
    set(amount) {
        this.value = amount;
        return this.triggerUpdate();
    }

    /**
     * @returns {Promise<Counter>}
     */
    triggerUpdate() {
        const self = this;
        return new Promise((resolve, reject) => {
            const valueDelta = this.value - this.originalValue;
            // UPDATE SET + valueDelta
            self.database.run("UPDATE counters SET value = value + ? WHERE name = ?", [valueDelta, this.name], (error) => {
                if (error) {
                    return reject(error.message);
                }
                return resolve(self);
            })
        })
    }
}

class CounterDatabase {
    constructor(database) {
        this.database = database;
    }

    /**
     * @param counterName {string}
     * @param userId {string}
     * @returns {string}
     */
    getUserCounterName(counterName, userId) {
        return `peruser-${counterName}-${userId}`;
    }

    /**
     * @param name {string}
     * @returns {Promise<Counter>}
     */
    createCounter(name) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.database.run("INSERT INTO counters (name) VALUES (?)", [name], (error) => {
                if (error) {
                    return reject(error.message)
                }
                return resolve();
            });
        })
    }

    /**
     * @param counterName {string}
     * @param userId {string}
     * @returns {Promise<Counter>}
     */
    createUserCounter(counterName, userId) {
        return this.createCounter(this.getUserCounterName(counterName, userId));
    }

    /**
     * @param name {string}
     * @returns {Promise<Counter>}
     */
    incrementCounter(name) {
        const self = this;
        return new Promise(async (resolve, reject) => {
            try {
                const counter = await self.getCounter(name)
                await counter.addOne()
                return resolve(counter)
            } catch (e) {
                return reject(e)
            }
        })
    }

    /**
     * @param counterName {string}
     * @param userId {string}
     * @returns {Promise<Counter>}
     */
    incrementUserCounter(counterName, userId) {
        return this.incrementCounter(this.getUserCounterName(counterName, userId));
    }

    /**
     * @returns {Promise<Counter>}
     */
    resetCounter(name) {
        const self = this;
        return new Promise(async (resolve, reject) => {
            try {
                const counter = await self.getCounter(name)
                await counter.set(0)
                return resolve(counter)
            } catch (e) {
                return reject(e)
            }
        })
    }

    /**
     * @param name {string}
     * @returns {Promise<Counter>}
     */
    getCounter(name) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.database.get("SELECT name, value FROM counters WHERE name LIKE ?", [name], (error, row) => {
                if (row) {
                    return resolve(new Counter(self.database, row.name, row.value))
                }

                self.createCounter(name).then(() => {
                    return resolve(new Counter(self.database, name, 0))
                }).catch((error) => {
                    return reject(error)
                })
            });
        });
    }

    /**
     *
     * @param counterName {string}
     * @param userId {string}
     * @returns {Promise<Counter>}
     */
    getUserCounter(counterName, userId) {
        return this.getCounter(this.getUserCounterName(counterName, userId));
    }
}

module.exports = {
    CounterDatabase
};