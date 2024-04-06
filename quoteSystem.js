const sqlite3 = require('sqlite3').verbose();

class Quote {
    constructor(id, quote) {
        this.id = id;
        this.quote = quote;
    }

    getId() {
        return this.id
    }

    getQuote() {
        return this.quote
    }
}

class QuoteDatabase {
    constructor(database) {
        this.database = database
    }

    /**
     * @param {int} id
     * @returns {Promise<null|Quote>}
     */
    get(id) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.database.get("SELECT id,quote FROM quotes WHERE id = ?", [id], (error, row) => {
                if (row) {
                    return resolve(new Quote(row.id, row.quote))
                }

                if (error) {
                    return reject(error)
                } else {
                    return resolve(null)
                }
            })
        })
    }

    /**
     * @param {string} quote
     * @returns {Promise<null|Quote>} The Quote ID of the newly inserted quote
     */
    create(quote) {
        const self = this;
        return new Promise((resolve, reject) => {
            self.database.run("INSERT INTO quotes (quote) VALUES (?)", [quote], (error) => {
                if (error) {
                    return reject(error.message)
                }
                self.database.get("SELECT last_insert_rowid() AS id", [], (error, row) => {
                    if (row) {
                        return resolve(new Quote(row.id, quote))
                    }
                    if (error) {
                        return reject(error.message)
                    }
                    return resolve(null)
                })
            })
        })
    }
}

module.exports = {
    QuoteDatabase
};