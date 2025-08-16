const sqlite3 = require('sqlite3').verbose();

class TreatStreakDb {
    // Treat streak is a per-user streak that resets if a stream is missed
    // TODO
}

class FirstStreak {
    // First streak is a global streak that resets if someone else claims it

    /**
     * @param database
     * @param {CounterDatabase} counterDatabase
     */
    constructor(database, counterDatabase) {
        this.database = database;
        this.counterDatabase = counterDatabase;
    }

    /**
     * @param {string} userId
     * @returns {Promise<Counter>}
     */
    async claimFirst(userId) {
        const lastFirst = await this.getLastFirst();
        let counter;
        console.debug('lastFirst, userId', lastFirst, userId);
        if (lastFirst === userId) {
            counter = await this.counterDatabase.incrementCounter('first-streak');
        } else {
            await this.updateLastFirst(userId);
            counter = await this.counterDatabase.getCounter('first-streak');
            await counter.set(1);
        }
        return counter;
    }

    /**
     * @returns {Promise<string>}
     */
    getLastFirst() {
        return new Promise((resolve, reject) => {
            this.database.get("SELECT value FROM simpleState WHERE varName=?", ['firstUserId'], (error, row) => {
                console.debug(error, row);
                resolve(row ? row.value : null);
            })
        });
    }

    /**
     * @param {string} userId
     * @returns {Promise<void>}
     */
    async updateLastFirst(userId) {
        this.database.run("REPLACE INTO simpleState(varName, value) VALUES (?,?)", ['firstUserId', userId]);
    }
}

module.exports = {
    FirstStreak
}
