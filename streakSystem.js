const sqlite3 = require('sqlite3').verbose();

class TreatStreakDb {
    // Treat streak is a per-user streak that resets if a stream is missed
    // TODO
    // I think our approach here should be to:
    // 1. Keep a variable of the last stream start date (don't increase streaks for streams same day
    // 1a. One variable will hold the latest
    // 1b. One variable will hold the one before.  When the latest changes, the one before is updated
    // 2. Keep a per-user variable of the last stream they redeemed on
    // 3. When a user redeems, check if their last stream matches the "last stream before" - if so, streak counter +1 - else reset to 1

    /**
     * @param {Database} database
     * @param {CounterDatabase} counterDatabase
     */
    constructor(database, counterDatabase) {
        this.VAR_LAST_STREAK_STREAM = 'lastStreakStream';
        this.VAR_RECENT_STREAM = 'mostRecentStream';
        this.simpleState = new SimpleState(database);
        this.counterDatabase = counterDatabase;
    }

    /**
     * This should be called when it is detected that the stream has begun
     *
     * @returns {Promise<void>}
     */
    async updateLastStream() {
        const previousStream = await this._getRecentStream();
        const rightNow = new Date();
        this.currentStream = this._formatDate(rightNow);

        if (previousStream === this.currentStream) {
            // some sort of restart event, don't update it!
            return;
        }

        Promise.all([
            this._setPreviousStream(previousStream),
            this._setRecentStream(this.currentStream)
        ]).then();
    }

    /**
     *
     * @param {string} date
     * @return Promise<void>
     * @private
     */
    async _setPreviousStream(date) {
        await this.simpleState.set(this.VAR_LAST_STREAK_STREAM, date);
    }

    /**
     *
     * @param {string} date
     * @returns {Promise<void>}
     * @private
     */
    async _setRecentStream(date) {
        await this.simpleState.set(this.VAR_RECENT_STREAM, date);
    }

    /**
     *
     * @returns {Promise<string>}
     * @private
     */
    async _getRecentStream() {
        return await this.simpleState.get(this.VAR_RECENT_STREAM);
    }


    async updateUserStreak(userId) {
        const userLastStream = await this.simpleState.get(this.VAR_RECENT_STREAM + '-' + userId);

        const lastStream = await this._getLastStream();
        let streakCounter = await this.counterDatabase.getUserCounter('streamStreak', userId);
        if (lastStream === userLastStream) {
            streakCounter = await streakCounter.addOne();
        } else {
            streakCounter = await streakCounter.set(1);
        }
        this.simpleState.set(this.VAR_RECENT_STREAM + '-' + userId, await this._getRecentStream()).then();

        return streakCounter;
    }

    /**
     *
     * @returns {Promise<string>}
     * @private
     */
    async _getLastStream() {
        return await this.simpleState.get(this.VAR_LAST_STREAK_STREAM);
    }

    /**
     *
     * @param {Date} date
     * @returns {string}
     * @private
     */
    _formatDate(date) {
        let year = date.getFullYear(),
            month = date.getMonth() + 1,
            day = date.getDate();
        if (month < 10) {
            month = '0' + month;
        }
        if (day < 10) {
            day = '0' + day;
        }

        return `${year}-${month}-${day}`;
    }
}

class SimpleState {
    constructor(database) {
        this.database = database;
    }

    /**
     * @param {string} varName
     * @returns {Promise<string|null>}
     */
    get(varName) {
        return new Promise((resolve, reject) => {
            this.database.get("SELECT value FROM simpleState WHERE varName=?", [varName], (err, row) => {
                console.log('Simple State Get', row, err);
                if (err) {
                    reject(err);
                } else if (row === null || row === undefined) {
                    resolve(null);
                } else {
                    resolve(row['value']);
                }
            })
        })
    }

    set(varName, value) {
        return new Promise((resolve) => {
            this.database.run("REPLACE INTO simpleState(varName, value) VALUES(?,?)", [varName, value], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        })
    }
}

class FirstStreak {
    // First streak is a global streak that resets if someone else claims it

    /**
     * @param database
     * @param {CounterDatabase} counterDatabase
     */
    constructor(database, counterDatabase) {
        this.database = database;
        this.simpleState = new SimpleState(database);
        this.counterDatabase = counterDatabase;
    }

    /**
     * @param {string} userId
     * @returns {Promise<Counter>}
     */
    async claimFirst(userId) {
        const lastFirst = await this.getLastFirst();
        let counter;
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
    async getLastFirst() {
        return await this.simpleState.get('firstUserId');
    }

    /**
     * @param {string} userId
     * @returns {Promise<void>}
     */
    async updateLastFirst(userId) {
        await this.simpleState.set('firstUserId', userId);
    }
}

module.exports = {
    FirstStreak,
    TreatStreakDb,
    SimpleState
}
