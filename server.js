const {Database} = require("sqlite3")
const {QuoteDatabase} = require("./quoteSystem")

const {RefreshingAuthProvider, exchangeCode} = require("@twurple/auth")
const {Bot, createBotCommand} = require("@twurple/easy-bot")
const {EventSubWsListener} = require("@twurple/eventsub-ws")
const {PronounDatabase} = require("./pronounDatabase")
const {ApiClient} = require("@twurple/api")
const express = require('express')
const {createServer} = require('http')
const {Server} = require('socket.io')
const moment = require('moment')
const fs = require("node:fs")
const {CounterDatabase} = require('./counterSystem')
const {FirstStreak, TreatStreakDb} = require('./streakSystem')
import('node-fetch')

require('dotenv').config()

const clientId = process.env.TWITCH_CLIENT_ID
const clientSecret = process.env.TWITCH_CLIENT_SECRET

const authProvider = new RefreshingAuthProvider({clientId, clientSecret})
authProvider.onRefresh(async (userId, newTokenData) => {
    await fs.writeFile(
        `./tokens.${userId}.json`,
        JSON.stringify(newTokenData, null, 4),
        () => {
        }
    )
})
const apiClient = new ApiClient({authProvider})

const database = new Database('./database.db', (err) => {
    if (err) throw err
})

/**
 * @param min {int} Minimum number to return
 * @param max {int} Maximum number to return
 */
const getRandomNumber = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const getRandomArrayKey = function(arr) {
    return Math.floor(Math.random() * arr.length);
}

const availableTreatsList = [
    'Konpeito',
    'Taiyaki',
    'Mochi',
    'Edamame',
    'Karinto',
    'Okonomiyaki',
    'Takoyaki',
    'Pocky',
    'Kakigori',
    'Onigiri',
    'Senbei',
    'Dango',
    'Yakitori',
    'Kenpi',
];

const availableTreatCount = {};

const pronounProvider = new PronounDatabase()
const counterDb = new CounterDatabase(database)
const quoteDb = new QuoteDatabase(database)
const streakDb = new FirstStreak(database, counterDb)
const treatStreakDb = new TreatStreakDb(database, counterDb)

// Configure moment
moment.relativeTimeThreshold('y', 365);
moment.relativeTimeThreshold('M', 12);

// Reset Daily Counters
const resetDailyCounters = async () => {
    await counterDb.resetCounter('cursesToday')
}
resetDailyCounters().finally(() => {
})

function convertMinutesToMilliseconds(minutes) {
    return 1000 * 60 * minutes
}

const postTwitchAuth = () => {
    console.log('Twitch Authorized')
    const bot = new Bot({
        authProvider,
        channels: [process.env.TWITCH_CHANNEL_NAME],
        commands: [
            // !so
            createBotCommand('so', async (params, {msg, broadcasterId, announce, reply, userId}) => {
                if (msg.userInfo.isMod || msg.userInfo.isBroadcaster) {
                    shoutout(params[0], announce, reply, broadcasterId)
                }
                // else do nothing, fail quietly
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
                say('nyavarDance nyavarDance nyavarDance FOXBOY RAID nyavarDance nyavarDance nyavarDance  The fox and his eepy nyavarEepy companions have arrived with PERKED EARS and PUFFY TAIL to chill in your lovely stream nyavarHeart')
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

            // !team
            createBotCommand('team', (params, {say}) => {
                say('We\'re part of 🦇 CREATURE FEATURE 🦇 - An Aggressively Pro-LGBTQIA+ and Marginalized Peoples Safe Space. Learn more at https://twitter.com/CFeatureTTV')
            }, {aliases: ['creaturefeature', 'creatures']}),

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
                    console.error(error)
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

                    await say(`Quite the sailor's mouth, eh?  That's ${cursesToday} ${cursesToday === 1 ? 'curse' : 'curses'} this stream and ${allCurses} since we started counting!`)
                } catch (error) {
                    console.error(error)
                    await reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }, {aliases: ['language', 'swear', 'swearjar']}),

            // !partner
            createBotCommand('partner', async (params, {userName, userDisplayName, say, reply}) => {
                try {
                    const result = await fetch(`https://blackglasses.co/comission-command/navarr/pokepicker.php?name=${userName}`)
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

            // !notgirl
            createBotCommand('notgirl', async (params, {say, reply}) => {
                try {
                    const notGirlCount = (await counterDb.incrementCounter('notgirl')).get()

                    say(`Nyavarr has apparently been confused for a girl ${notGirlCount} times since we started counting`)
                } catch (error) {
                    console.error(error)
                    reply('Something went wrong. The error has been logged for Nyavarr')
                }
            }, {aliases: ['notagirl', 'girl']}),

            // !quote
            createBotCommand('quote', async (params, {say, reply}) => {
                if (params.length === 0) {
                    try {
                        const quote = await quoteDb.getRandom()
                        if (quote) {
                            reply(`Quote #${quote.getId()}: ${quote.getQuote()}`)
                        } else {
                            reply('There exist no quotes at all (probably)!')
                        }
                    } catch (error) {
                        console.error(error)
                        reply('Something went wrong. The error has been logged for Nyavarr')
                    }
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
            createBotCommand('addquote', async (params, {reply}) => {
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

            // createBotCommand('charity', async (params, {say}) => {
            //     say('Support the Trevor Project with us but making your donation at https://tiltify.com/@navarr/shapeshifters-oct-2024')
            // }, {aliases: ['donate', 'trevorproject', 'trevor']}),

            createBotCommand('vrchat', async (params, {reply}) => {
                reply('Join my VRChat group!  NYAVAR.2175 (or use the link) https://vrc.group/NYAVAR.2175')
            }, {aliases: ['group']}),

            // !throne
            createBotCommand('throne', async (params, {say, reply}) => {
                say('Nyavarr has a throne including the ability to leave anonymous and surprise gifts. https://throne.me/navarr')
            }),

            createBotCommand('credits', async (params, {reply}) => {
                reply('You can find credits for everything used in stream at https://github.com/nyavarr/credits')
            }, {aliases: ['credit']}),

            createBotCommand('merch', async (params, {reply}) => {
                reply('You\'re really considering buying some merch? nyavarShy You can find the storefront at https://shop.nyavarr.com/ - Post in the discord if you have more ideas!')
            }, {aliases: ['shop', 'store']}),

            createBotCommand('bonkcount', async(params, {reply}) => {
                const counterName = 'bonk';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, params.userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        reply('Nyavarr has never been bonked.');
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `Nyavarr has been bonked ${allCount} time${allCount > 1 ? 's' : ''}`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    reply(allString + userString);
                }).catch((e) => {
                    console.error(e);
                    reply('I encountered an error grabbing the count.  Please try again later. The error has been logged.');
                })
            }),

            createBotCommand('deercount', async(params, {reply, userId}) => {
                const counterName = 'deer';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, params.userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        reply('Nyavarr has never been turned into a deer.');
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `Nyavarr has been turned into a deer ${allCount} time${allCount > 1 ? 's' : ''}`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    reply(allString + userString);
                }).catch((e) => {
                    console.error(e);
                    reply('I encountered an error grabbing the count.  Please try again later. The error has been logged.');
                })
            }),

            createBotCommand('thrown', async(params, {reply}) => {
                const counterName = 'throw';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, params.userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        reply('Nyavarr has never had anything thrown at them.');
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `Nyavarr has had ${allCount} thing${allCount > 1 ? 's' : ''} thrown at him`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    reply(allString + userString);
                }).catch((e) => {
                    console.error(e);
                    reply('I encountered an error grabbing the count.  Please try again later. The error has been logged.');
                })
            })
        ]
    })

    async function shoutout(soUserName, responseFunction, errorResponseFunction, broadcasterId) {
        soUserName = soUserName.toLowerCase().replace('@', '')
        let soUser
        try {
            soUser = await apiClient.users.getUserByNameBatched(soUserName)
        } catch (e) {
            soUser = null
        }
        if (soUser === null) {
            errorResponseFunction(`Could not find Twitch account with username "${soUserName.toLowerCase()}"`)
            return
        }

        const soChannel = await apiClient.channels.getChannelInfoById(soUser.id)
        soUserName = soUser.name

        let pronoun
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

    const twitchEventSubListener = new EventSubWsListener({apiClient})
    twitchEventSubListener.start()

    // Ad Break Starting
    twitchEventSubListener.onChannelAdBreakBegin(process.env.TWITCH_CHANNEL_ID, (event) => {
        const duration = moment.duration({s: event.durationSeconds}).humanize()
        bot.announce(
            process.env.TWITCH_CHANNEL_NAME,
            `We're taking a quick ad break. These are scheduled to keep pre-rolls off. See you in ${duration}!`
        )
    })

    twitchEventSubListener.onChannelRedemptionAdd(process.env.TWITCH_CHANNEL_ID, (event) => {
        if (event.rewardTitle === 'Daily Treat') {
            treatStreakDb._updateUserStreak(event.userId).then();

            const treatKey = getRandomArrayKey(availableTreatsList),
                treat = availableTreatsList[treatKey];

            counterDb.incrementCounter('daily').then().catch((err) => console.error(err));
            counterDb.incrementCounter(`daily-${treat}`).then().catch((err) => console.error(err));
            counterDb.incrementUserCounter(`daily-${treat}`).then().catch((err) => console.error(err));
            counterDb.incrementUserCounter('daily', event.userId).then((counter) => {
                bot.say(process.env.TWITCH_CHANNEL_NAME, `@${event.userDisplayName} Here's your ${moment.localeData().ordinal(counter.get())} treat - ${treat}!  Thank you! nyavarHeart nyavarHeart nyavarHeart`);
            }).catch((error) => {
                console.error(error)
                bot.say(process.env.TWITCH_CHANNEL_NAME, 'Something went wrong redeeming your treat.  I\'m sorry nyavarTear');
            })
        }
        if (event.rewardTitle === 'FIRST') {
            counterDb.incrementCounter('first').then().catch((err) => console.error(err));
            Promise.all([
                counterDb.incrementUserCounter('first', event.userId),
                streakDb.claimFirst(event.userId)
            ]).then(([userCounter, streakCounter]) => {
                const unassembledText = [
                    'nyavarDance nyavarDance nyavarDance',
                    `${event.userDisplayName} has gotten FIRST ${userCounter.get()} time${userCounter.get() === 1 ? '' : 's'}!`
                ];
                if (streakCounter.get() > 1) {
                    unassembledText.push(`(STREAK: x${streakCounter.get()}!)`);
                }
                bot.say(
                    process.env.TWITCH_CHANNEL_NAME,
                    unassembledText.join(' ')
                )
            }).catch((error) => {
                console.error(error)
            })
        }
        if (event.rewardTitle === 'Throw Something!') {
            counterDb.incrementUserCounter('thrown', event.userId).then(() => {}).catch((error) => {
                console.error(error)
            })
            counterDb.incrementCounter('thrown').then(() => {}).catch((error) => {
                console.error(error)
            })
        }
        if (event.rewardTitle === 'bonk') {
            counterDb.incrementUserCounter('bonk', event.userId).then(() => {}).catch((error) => {
                console.error(error)
            })
            counterDb.incrementCounter('bonk').then(() => {}).catch((error) => {
                console.error(error)
            })
        }
        if (event.rewardTitle === 'DEER!') {
            counterDb.incrementUserCounter('deer', event.userId).then(() => {}).catch((error) => {
                console.error(error)
            })
            counterDb.incrementCounter('deer').then(() => {}).catch((error) => {
                console.error(error)
            })
        }
    })

    // Timers
    const generalTimerMessages = [
        'Did you know I have a throne?  I\'ve got neat and... interesting... things on there if you want to send me a gift!  https://throne.com/navarr',
        'Join the discord for schedule updates and optional going-live notifications! https://discord.gg/W6g5r4Wf2E',
        'Check out the TikTok for highlights you might have missed! https://tiktok.com/@nyavarr',
        'Please help me out!  It\'s hard to clip interesting or amusing moments when I\'m in the action.  You don\'t even need to edit the video, just redeem "Clip It!" and the bot will take care of the rest',
        'Do you like the stream?  Don\'t be so engrossed you forget to drop a follow!  It\'ll help you know about my upcoming streams.',
        'I work hard to keep my Twitch Schedule up to date.  Take a look and see what the future holds: https://twitch.tv/nyavarr/schedule',
        'ABWAH! We have MERCH!  Go check it out at https://shop.nyavarr.com/',
        'We\'re part of 🦇 CREATURE FEATURE 🦇 - An Aggressively Pro-LGBTQIA+ and Marginalized Peoples Safe Space. Learn more at https://twitter.com/CFeatureTTV'
    ]
    let generalTimerInterval = null
    /** @type {number} The index of the next message to send. */
    let generalTimerIndex = 0
    twitchEventSubListener.onStreamOnline(process.env.TWITCH_CHANNEL_ID, async (event) => {
        console.debug('onStreamOnline')

        treatStreakDb.updateLastStream().then().catch((error) => {console.error(error)});

        // Timed Messages
        clearInterval(generalTimerInterval)
        generalTimerInterval = setInterval(
            () => {
                let maxIndex = generalTimerMessages.length - 1
                if (generalTimerIndex > maxIndex) {
                    generalTimerIndex = 0
                }
                bot.say(process.env.TWITCH_CHANNEL_NAME, generalTimerMessages[generalTimerIndex])
                generalTimerIndex++
            },
            convertMinutesToMilliseconds(10)
        )
        // Stream Starting Announcement
        setTimeout(async () => {
            try {
                const game = (await event.getStream()).gameName
                const title = (await event.getStream()).title
                bot.announce(process.env.TWITCH_CHANNEL_NAME, `${event.broadcasterDisplayName} is now live streaming ${game}: ${title}`)
            } catch (e) {
                console.error('Recoverable Error', e)
            }
        }, 500) // Wait a bit so Twitch will have getStream.  At least once getStream has been NULL

        await resetDailyCounters()
    })

    twitchEventSubListener.onStreamOffline(process.env.TWITCH_CHANNEL_ID, (event) => {
        console.debug('onStreamOffline')
        clearInterval(generalTimerInterval)
    })

    twitchEventSubListener.onChannelRaidFrom(process.env.TWITCH_CHANNEL_ID, (event) => {
        console.debug('onChannelRaidTo')
        bot.announce(process.env.TWITCH_CHANNEL_NAME, `${event.raidingBroadcasterDisplayName} has raided out to ${event.raidedBroadcasterDisplayName}!  Did you miss it?  Join at https://twitch.tv/${event.raidedBroadcasterName}`)
    })
}

let isBotAuthorized = false
let isOwnerAuthorized = false

function startupAfterAuths() {
    if (isBotAuthorized && isOwnerAuthorized) {
        postTwitchAuth()
    }
}

fs.readFile(`./tokens.${process.env.BOT_USER_ID}.json`, (error, data) => {
    if (error) {
        console.error('Reading auth file as bot', error)
        return
    }
    authProvider.addUserForToken(JSON.parse(data.toString()), ['chat']).then(() => {
        console.debug('Authorized as Bot')
        isBotAuthorized = true
        startupAfterAuths()
    }).catch((e) => {
        console.error('Authorizing as Bot', e)
    })
})
fs.readFile(`./tokens.${process.env.TWITCH_CHANNEL_ID}.json`, (error, data) => {
    if (error) {
        console.error('Reading auth file as owner', error)
        return
    }
    authProvider.addUserForToken(JSON.parse(data.toString())).then(() => {
        console.debug('Authorized as Owner')
        isOwnerAuthorized = true
        startupAfterAuths()
    }).catch((e) => {
        console.error('Authorizing as Channel Owner', e)
    })
})

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {cors: {origin: '*'}})
const port = process.env.HTTP_SERVER_PORT

io.on('connection', (socket) => {
    if (!isOwnerAuthorized || !isBotAuthorized) {
        socket.emit('twitchData', {clientId, redirectPort: port})
        socket.emit('needsTwitchAuth')
    }

})

app.get('/auth', async (req, res) => {
    if (isBotAuthorized && isOwnerAuthorized) {
        res.send('Error already authorized')
    } else if (req.query.code) {
        const tokenData = await exchangeCode(clientId, clientSecret, req.query.code, `http://localhost:${port}/auth`)
        const userId = await authProvider.addUserForToken(tokenData)
        fs.writeFile(
            `./tokens.${userId}.json`,
            JSON.stringify(tokenData, null, 4),
            () => {
            }
        )
        io.sockets.emit('twitchAuthorized')
        res.send('Success')
        if (userId === process.env.BOT_USER_ID) {
            isBotAuthorized = true
            authProvider.addIntentsToUser(userId, ['chat'])
            startupAfterAuths()
        }
        if (userId === process.env.TWITCH_CHANNEL_ID) {
            isOwnerAuthorized = true
            startupAfterAuths()
        }
    } else {
        res.send('Error no code')
    }
})

app.use(express.static('public'))

httpServer.listen(port)
