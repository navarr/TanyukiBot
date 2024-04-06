const {Database} = require("sqlite3");
const {QuoteDatabase} = require("./quoteSystem");

const {RefreshingAuthProvider, exchangeCode} = require("@twurple/auth");
const {Bot, createBotCommand} = require("@twurple/easy-bot");
const {PronounDatabase} = require("./pronounDatabase")
const {ApiClient} = require("@twurple/api");
const express = require('express')
const {createServer} = require('http')
const {Server} = require('socket.io')
const moment = require('moment')
const fs = require("node:fs");
const {CounterDatabase} = require('./counterSystem')
import('node-fetch')

require('dotenv').config()

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;

const authProvider = new RefreshingAuthProvider({clientId, clientSecret})
authProvider.onRefresh(async (userId, newTokenData) => {
    await fs.writeFile(
        `./tokens.${userId}.json`,
        JSON.stringify(newTokenData, null, 4),
        () => {
        }
    )
});
const apiClient = new ApiClient({authProvider})

const database = new Database('./database.db', (err) => {
    if (err) throw err;
});

const pronounProvider = new PronounDatabase()
const counterDb = new CounterDatabase(database)
const quoteDb = new QuoteDatabase(database)

let twitchIsAuthorized = false;

const postTwitchAuth = () => {
    console.log('Twitch Authorized')
    const bot = new Bot({
        authProvider,
        channels: ['nyavarr'],
        commands: [
            // !so
            createBotCommand('so', async (params, {broadcasterId, announce, reply}) => {
                await shoutout(params[0], announce, reply, broadcasterId)

            }, {aliases: ['shoutout']}),

            // !lurk
            createBotCommand('lurk', (params, {reply, userDisplayName}) => {
                reply(`We are the watchers! Or the chrome-tab-muters because we have important things to do.  Either way, we appreciate you ${userDisplayName}.`)
            }),

            // !discord
            createBotCommand('discord', (params, {say}) => {
                say('Join our Discord for news about the stream!  https://discord.gg/W6g5r4Wf2E')
            }),

            // !pronouns
            createBotCommand('pronouns', (params, {say}) => {
                say('Nyavarr uses he or they pronouns.  K uses she/her pronouns.  To get your pronouns in chat, use https://chrome.google.com/webstore/detail/twitch-chat-pronouns/agnfbjmjkdncblnkpkgoefbpogemfcii')
            }, {aliases: ['pronoun']}),

            // !raid
            createBotCommand('raid', (params, {say}) => {
                say('Despite being the Eepiest nyavarEepy The FOXBOY RAID has arrived with PERKED EARS nyavarExcite AND PUFFY TAIL to chill in your lovely stream nyavarLoveL nyavarLoveR')
                say('Despite being the Eepiest 😴 The FOXBOY RAID has arrived with PERKED EARS 🦊 AND PUFFY TAIL to chill in your lovely stream ❤️❤️')
            }, {aliases: ['raid']}),

            // !socials
            createBotCommand('socials', (params, {say}) => {
                say('Follow me at: Discord: https://discord.gg/W6g5r4Wf2E | VODs, Clips, and More: https://linktr.ee/NavarrVT')
            }, {aliases: ['social']}),

            // !foxtail
            createBotCommand('foxtail', (params, {say}) => {
                say('Our goal is now in the form of FOX TAILS!  Support the stream and help achieve the goal by subbing or gifting a sub (T1=1 tail, T2=2 tails, T3=6 tails) or with bits (250 = 1 tail) or TikTok coins (500 = 1 tail)!')
            }, {aliases: ['foxtails']}),

            // !theguys
            createBotCommand('theguys', (params, {say}) => {
                say('Please, allow me to introduce you to the fine gentleman joining me on Thursdays: @npfund: Nick, an amazing colleague and coworker from a previous job.  @krabbby: Krabbby, a man of mystery who previously lead The Night\'s Watch (a MineZ Guild I founded)')
            }),

            // !followage
            createBotCommand('followage', async (params, {broadcasterName, broadcasterId, userId, reply}) => {
                apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    const {data: [follow]} = await ctx.channels.getChannelFollowers(broadcasterId, userId)
                    if (follow) {
                        const since = moment(follow.followDate)
                        const duration = moment.duration(moment().diff(since)).humanize()
                        reply(`You have been following ${broadcasterName} for ${duration}!`)
                    } else {
                        reply(`You do not appear to be following ${broadcasterName} yet... maybe you'd like to start?`)
                    }
                })
            }),

            // !uptime
            createBotCommand('uptime', async (params, {broadcasterName, broadcasterId, say}) => {
                apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    const stream = await ctx.streams.getStreamByUserIdBatched(broadcasterId)
                    if (stream) {
                        const since = moment(stream.startDate)
                        const duration = since.diff(moment()).humanize()
                        say(`${broadcasterName} has been streaming for ${duration}`)
                    } else {
                        say(`${broadcasterName} is not currently streaming`)
                    }
                })
            }),

            // !deez
            createBotCommand('deez', async (params, {say, reply}) => {
                counterDb.incrementCounter('gottem').then((counter) => {
                    let message
                    if (params.length) {
                        const deez = params.join(' ')
                        message = `${deez}? More like ${deez} NUTZ!  Haha, gottem. Number ${counter.get()}`
                    } else {
                        message = `Haha, gottem. Number ${counter.get()}`
                    }
                    say(message)
                }).catch((error) => {
                    console.error(error);
                    reply('Something went wrong.  The error has been logged for Nyavarr')
                })
            }),

            // !fast
            createBotCommand('fast', async (params, {say, reply}) => {
                counterDb.incrementCounter('speed').then((counter) => {
                    say(`Are they fast or am I just slow? Probably the latter, since I've mentioned their speed ${counter.get()} times.`)
                }).catch((error) => {
                    console.error(error)
                    reply('Something went wrong. The error has been logged for Nyavarr')
                })
            }),

            // !curse
            createBotCommand('curse', async (params, {say, reply}) => {
                try {
                    const cursesToday = (await counterDb.incrementCounter('cursesToday')).get()
                    const allCurses = (await counterDb.incrementCounter('allCurses')).get()

                    await say(`Quite the sailor's mouth, eh?  That's ${cursesToday} ${cursesToday === 1 ? 'curse' : 'curses'} today, and ${allCurses} since we started counting!`)
                } catch (error) {
                    console.error(error)
                    await reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }, {aliases: ['language', 'swear', 'swearjar']}),

            // !partner
            createBotCommand('partner', async (params, {userName, userDisplayName, say, reply}) => {
                try {
                    const result = await fetch(`https://blackglasses.co/comission-command/navarr/pokepicker.php?name=${userName}`);
                    const pokemon = await result.text()
                    reply(`Your partner Pokémon is... ${pokemon}`)
                } catch (error) {
                    reply(`I was unable to determine ${userDisplayName}'s partner at this time.`)
                }
            }),

            // !beanboozled
            createBotCommand('beanboozled', async (params, {say, reply}) => {
                try {
                    const badbeans = (await counterDb.incrementCounter('badbean')).get()

                    say(`Hey Bean, you just got BOOZLED.  Beanboozled. Haha. ${badbeans} bad beans!`)
                } catch (error) {
                    console.error(error)
                    reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }, {aliases: ['badbean']}),

            // !quote
            createBotCommand('quote', async (params, {say, reply}) => {
                if (params.length === 0) {
                    // todo random quote
                    reply('I can\'t do random quite yet...')
                    return
                }
                if (params.length > 1) {
                    reply('Are you trying to create a quote?  Use !addquote for that')
                    return
                }
                // Get Quote by Id
                try {
                    const quote = await quoteDb.get(params[0])
                    if (quote) {
                        reply(`Quote #${quote.getId()}: ${quote.getQuote()}`)
                    } else {
                        reply('No such quote.')
                    }
                } catch (error) {
                    console.error(error)
                    reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }),

            // !addquote
            createBotCommand('addquote', async (params, {say, reply}) => {
                if (params.length === 0) {
                    reply('You uh.. forgot to include the quote.')
                    return
                }
                let quoteText = params.join(' ')
                try {
                    const newQuote = await quoteDb.create(quoteText)
                    if (newQuote) {
                        reply(`Created quote #${newQuote.getId()}`)
                    } else {
                        reply(`There may have been a problem creating the quote.  Honestly, not sure what happened`)
                    }
                } catch (error) {
                    console.error(error)
                    reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }),
        ]
    })

    async function shoutout(soUserName, responseFunction, errorResponseFunction, broadcasterId) {
        const soUser = await apiClient.users.getUserByNameBatched(soUserName)
        if (soUser === null) {
            errorResponseFunction(`Could not find Twitch account with username "${soUserName}"`)
            return;
        }

        const soChannel = await apiClient.channels.getChannelInfoById(soUser.id)
        soUserName = soUser.name

        let pronoun;
        try {
            pronoun = await pronounProvider.getPronouns('twitch', soUserName)
        } catch (e) {
            pronoun = {simple: 'they', pastParticle: 'were'}
            console.error(e)
        }

        let game = ''
        if (soChannel) {
            game = soChannel.gameName
        }
        if (game.length > 0) {
            responseFunction(`Check out ${soUser.displayName}, ${pronoun.simple} ${pronoun.pastParticle} last seen playing ${game} at https://twitch.tv/${soUser.name}`)
        } else {
            responseFunction(`Check out ${soUser.displayName} at https://twitch.tv/${soUser.name}`)
        }

        await apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
            try {
                await ctx.chat.shoutoutUser(broadcasterId, soUser.id)
            } catch (e) {
                // Do nothing.. That's fine.
            }
        })
    }

    bot.onRaid(({broadcasterName, broadcasterId, userName}) => {
        shoutout(
            userName,
            (message) => {
                bot.announce(broadcasterName, message)
            },
            (message) => {
                bot.say(broadcasterName, `${message} (This.. shouldn't be possible)`)
            },
            broadcasterId
        )
    })
}

fs.readFile(`./tokens.${process.env.BOT_USER_ID}.json`, (error, data) => {
    if (error) {
        return;
    }
    authProvider.addUserForToken(JSON.parse(data.toString()), ['chat']).then(() => {
        twitchIsAuthorized = true;
        postTwitchAuth();
    }).catch((e) => {
        console.error(e);
    })
})

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {cors: {origin: '*'}})
const port = process.env.HTTP_SERVER_PORT

io.on('connection', (socket) => {
    if (!twitchIsAuthorized) {
        socket.emit('twitchData', {clientId, redirectPort: port})
        socket.emit('needsTwitchAuth');
    }

})

app.get('/auth', async (req, res) => {
    if (twitchIsAuthorized) {
        res.send('Error already authorized')
    } else if (req.query.code) {
        twitchIsAuthorized = true;
        const tokenData = await exchangeCode(clientId, clientSecret, req.query.code, `http://localhost:${port}/auth`);
        await authProvider.addUserForToken(tokenData, ['chat']);
        fs.writeFile(
            `./tokens.${process.env.BOT_USER_ID}.json`,
            JSON.stringify(tokenData, null, 4),
            () => {
            }
        )
        io.sockets.emit('twitchAuthorized');
        res.send('Success')
        postTwitchAuth()
    } else {
        res.send('Error no code')
    }
})

app.use(express.static('public'))

httpServer.listen(port)