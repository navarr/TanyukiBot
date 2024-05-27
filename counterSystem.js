const sqlite3 = require('sqlite3').verbose();

class Counter {
    constructor(database, name, value) {
        this.database = database;
        this.name = name;
        this.originalValue = value;
        this.value = value;
    }

    addOne() {
        return this.add(1);
    }

    add(amount) {
        this.value += amount;
        return this.triggerUpdate()
    }

    subOne() {
        return this.subtract(1);
    }

    subtract(amount) {
        this.value -= amount;
        return this.triggerUpdate()
    }

    get() {
        return this.value
    }

    set(amount) {
        this.value = amount;
        return this.triggerUpdate();
    }

    triggerUpdate() {
        const self = this;
        return new Promise((resolve, reject) => {
            const valueDelta = this.value - this.originalValue;
            // UPDATE SET + valueDelta
            self.database.run("UPDATE counters SET value = value + ? WHERE name = ?", [valueDelta, this.name], (error) => {
                if (error) {
                    return reject(error.message);
                }
                return resolve();
            })
        })
    }
}

class CounterDatabase {
    constructor(database) {
        this.database = database;
    }

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
}

module.exports = {
    CounterDatabase
};