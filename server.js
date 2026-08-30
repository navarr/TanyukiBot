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
const {ChatMessage} = require("@twurple/chat");
import('node-fetch')

require('dotenv').config()

const clientId = process.env.TWITCH_CLIENT_ID
const clientSecret = process.env.TWITCH_CLIENT_SECRET

const authProvider = new RefreshingAuthProvider({clientId, clientSecret})
authProvider.onRefresh(async (userId, newTokenData) => {
    fs.writeFile(
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

const getRandomArrayKey = function (arr) {
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

const pronounProvider = new PronounDatabase()
const counterDb = new CounterDatabase(database)
const quoteDb = new QuoteDatabase(database)
const streakDb = new FirstStreak(database, counterDb)
const treatStreakDb = new TreatStreakDb(database, counterDb)

// Configure moment
moment.relativeTimeThreshold('y', 365);
moment.relativeTimeThreshold('M', 9999);

// Reset Daily Counters
const resetDailyCounters = async () => {
    await counterDb.resetCounter('cursesToday')
}
resetDailyCounters().finally(() => {
})

function convertMinutesToMilliseconds(minutes) {
    return 1000 * 60 * minutes
}

/**
 * @param {ChatMessage} msg
 * @return {boolean}
 */
function canIncrementCounter(msg) {
    return msg.userInfo.isMod || msg.userInfo.isVip || msg.userInfo.isBroadcaster || msg.userInfo.isLeadMod;
}

/**
 *
 * @param {ChatMessage} msg
 * @returns {boolean}
 */
function canPerformModAction(msg) {
    return msg.userInfo.isMod || msg.userInfo.isBroadcaster || msg.userInfo.isLeadMod;
}

const postTwitchAuth = () => {
    console.log('Twitch Authorized')

    const bot = new Bot({
        authProvider,
        channels: [process.env.TWITCH_CHANNEL_NAME],
        commands: [
            // !so
            createBotCommand('so', async (params, {msg, broadcasterId, announce, reply}) => {
                if (canPerformModAction(msg)) {
                    shoutout(params[0], announce, reply, broadcasterId).then();
                }
                // else do nothing, fail quietly
            }, {aliases: ['shoutout']}),

            // !lurk
            createBotCommand('lurk', (params, {msg, userDisplayName}) => {
                replyChat(`We are the watchers! Or the chrome-tab-muters because we have important things to do.  Either way, we appreciate you ${userDisplayName}.`, msg.id).then();
            }),

            // !discord
            createBotCommand('discord', (params, {say}) => {
                sendChat('Join our Discord for news about the stream!  https://discord.gg/W6g5r4Wf2E').then();
            }),

            // !pronouns
            createBotCommand('pronouns', (params, {say}) => {
                sendChat('Nyavarr uses he or they pronouns.  K uses she/her pronouns.  To get your pronouns in chat, use https://chrome.google.com/webstore/detail/twitch-chat-pronouns/agnfbjmjkdncblnkpkgoefbpogemfcii').then();
            }, {aliases: ['pronoun']}),

            // !raid
            createBotCommand('raid', (params, {say}) => {
                sendChat('nyavarDance nyavarDance nyavarDance FOXBOY RAID nyavarDance nyavarDance nyavarDance  The fox and his eepy nyavarEepy companions have arrived with PERKED EARS and PUFFY TAIL to chill in your lovely stream nyavarHeart').then();
                sendChat('Despite being the Eepiest 😴 The FOXBOY RAID has arrived with PERKED EARS 🦊 AND PUFFY TAIL to chill in your lovely stream ❤️❤️').then();
            }, {aliases: ['raid']}),

            // !socials
            createBotCommand('socials', (params, {say}) => {
                sendChat('Follow me at: Discord: https://discord.gg/W6g5r4Wf2E | VODs, Clips, and More: https://linktr.ee/NavarrVT').then();
            }, {aliases: ['social']}),

            // !foxtail
            createBotCommand('foxtail', (params, {say}) => {
                sendChat('Our goal is now in the form of FOX TAILS!  Support the stream and help achieve the goal by subbing or gifting a sub (T1=1 tail, T2=2 tails, T3=6 tails) or with bits (250 = 1 tail) or TikTok coins (500 = 1 tail)!').then();
            }, {aliases: ['foxtails']}),

            // !theguys
            createBotCommand('theguys', (params, {say}) => {
                sendChat('Please, allow me to introduce you to the fine gentleman joining me on Thursdays: @npfund: Nick, an amazing colleague and coworker from a previous job.  @krabbby: Krabbby, a man of mystery who previously lead The Night\'s Watch (a MineZ Guild I founded) and @JediMasterGio: David, another amazing colleague and coworker from a previous job.').then();
            }),

            // !team
            createBotCommand('team', (params, {say}) => {
                sendChat('We\'re part of 🦇 CREATURE FEATURE 🦇 - An Aggressively Pro-LGBTQIA+ and Marginalized Peoples Safe Space. Learn more at https://twitter.com/CFeatureTTV').then();
            }, {aliases: ['creaturefeature', 'creatures']}),

            // !followage
            createBotCommand('followage', async (params, {broadcasterName, broadcasterId, userId, msg}) => {
                apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    const {data: [follow]} = await ctx.channels.getChannelFollowers(broadcasterId, userId)
                    if (follow) {
                        const since = moment(follow.followDate)
                        const duration = moment.duration(moment().diff(since)).humanize()
                        replyChat(`You have been following ${broadcasterName} for ${duration}!`, msg.id).then();
                    } else {
                        replyChat(`You do not appear to be following ${broadcasterName} yet... maybe you'd like to start?`, msg.id).then();
                    }
                })
            }),

            // !uptime
            createBotCommand('uptime', async (params, {broadcasterName, broadcasterId}) => {
                apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    const stream = await ctx.streams.getStreamByUserIdBatched(broadcasterId)
                    if (stream) {
                        const since = moment(stream.startDate)
                        const duration = moment.duration(moment().diff(since)).humanize();
                        sendChat(`${broadcasterName} has been streaming for ${duration}`).then();
                    } else {
                        sendChat(`${broadcasterName} is not currently streaming`).then();
                    }
                }).then();
            }),

            // !deez
            createBotCommand('deez', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                counterDb.incrementCounter('gottem').then((counter) => {
                    let message
                    if (params.length) {
                        const deez = params.join(' ')
                        message = `${deez}? More like ${deez} NUTZ!  Haha, gottem. Number ${counter.get()}`
                    } else {
                        message = `Haha, gottem. Number ${counter.get()}`
                    }
                    sendChat(message)
                }).catch((error) => {
                    console.error(error)
                    replyChat('Something went wrong.  The error has been logged for Nyavarr', msg.id).then();
                })
            }),

            createBotCommand('bless', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                counterDb.incrementCounter('sneeze').then((counter) => {
                    sendChat(`Bless you!  You must be a mess, sneezing ${counter.get()} times...`);
                }).catch((err) => {
                    console.error(err);
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id);
                });
            }, {aliases: ['blessyou', 'sneeze']}),

            createBotCommand('deer', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                counterDb.incrementCounter('calleddeer').then((counter) => {
                    sendChat(`Look what you've all done!  Nyavarr has been confused for a deer ${counter.get()} times!`)
                }).catch((err) => {
                    console.error(err);
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id);
                })
            }),

            // !fast
            createBotCommand('fast', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                counterDb.incrementCounter('speed').then((counter) => {
                    sendChat(`Are they fast or am I just slow? Probably the latter, since I've mentioned their speed ${counter.get()} times.`)
                }).catch((error) => {
                    console.error(error)
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                })
            }),

            // !curse
            createBotCommand('curse', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                try {
                    const cursesToday = (await counterDb.incrementCounter('cursesToday')).get()
                    const allCurses = (await counterDb.incrementCounter('allCurses')).get()

                    await sendChat(`Quite the sailor's mouth, eh?  That's ${cursesToday} ${cursesToday === 1 ? 'curse' : 'curses'} this stream and ${allCurses} since we started counting!`)
                } catch (error) {
                    console.error(error)
                    await replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                }
            }, {aliases: ['language', 'swear', 'swearjar']}),

            // !partner
            createBotCommand('partner', async (params, {userName, userDisplayName, msg}) => {
                try {
                    const result = await fetch(`https://blackglasses.co/comission-command/navarr/pokepicker.php?name=${userName}`)
                    const pokemon = await result.text()
                    replyChat(`Your partner Pokémon is... ${pokemon}`, msg.id);
                } catch (error) {
                    replyChat(`I was unable to determine ${userDisplayName}'s partner at this time.`, msg.id);
                }
            }),

            // !beanboozled
            createBotCommand('beanboozled', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                try {
                    const badbeans = (await counterDb.incrementCounter('badbean')).get()

                    sayChat(`Hey Bean, you just got BOOZLED.  Beanboozled. Haha. ${badbeans} bad beans!`)
                } catch (error) {
                    console.error(error)
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                }
            }, {aliases: ['badbean']}),

            // !notgirl
            createBotCommand('notgirl', async (params, {msg}) => {
                if (!canIncrementCounter(msg)) {
                    replyChat('You do not have permission to perform this action.', msg.id).then();
                    return;
                }
                try {
                    const notGirlCount = (await counterDb.incrementCounter('notgirl')).get()

                    sendChat(`Nyavarr has apparently been confused for a girl ${notGirlCount} times since we started counting`)
                } catch (error) {
                    console.error(error)
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                }
            }, {aliases: ['notagirl', 'girl']}),

            // !quote
            createBotCommand('quote', async (params, {msg}) => {
                if (params.length === 0) {
                    try {
                        const quote = await quoteDb.getRandom()
                        if (quote) {
                            replyChat(`Quote #${quote.getId()}: ${quote.getQuote()}`, msg.id)
                        } else {
                            replyChat('There exist no quotes at all (probably)!', msg.id)
                        }
                    } catch (error) {
                        console.error(error)
                        replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                    }
                    return
                }
                if (params.length > 1) {
                    replyChat('Are you trying to create a quote?  Use !addquote for that', msg.id)
                    return
                }
                // Get Quote by Id
                try {
                    const quote = await quoteDb.get(params[0])
                    if (quote) {
                        replyChat(`Quote #${quote.getId()}: ${quote.getQuote()}`, msg.id)
                    } else {
                        replyChat('No such quote.', msg.id)
                    }
                } catch (error) {
                    console.error(error)
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                }
            }),

            // !addquote
            createBotCommand('addquote', async (params, {msg}) => {
                if (params.length === 0) {
                    replyChat('You uh.. forgot to include the quote.', msg.id)
                    return
                }
                let quoteText = params.join(' ')
                try {
                    const newQuote = await quoteDb.create(quoteText)
                    if (newQuote) {
                        replyChat(`Created quote #${newQuote.getId()}`, msg.id)
                    } else {
                        replyChat(`There may have been a problem creating the quote.  Honestly, not sure what happened`, msg.id)
                    }
                } catch (error) {
                    console.error(error)
                    replyChat('Something went wrong. The error has been logged for Nyavarr', msg.id)
                }
            }),

            createBotCommand('charity', async (params, {}) => {
                sayChat('Support Stream for a Cause with us at https://charity.nyavarr.com/')
            }, {aliases: ['donate', 'trevorproject', 'trevor', 'sfac', 'fnof']}),

            createBotCommand('vrchat', async (params, {msg}) => {
                replyChat('Join my VRChat group!  NYAVAR.2175 (or use the link) https://vrc.group/NYAVAR.2175', msg.id)
            }, {aliases: ['group']}),

            // !throne
            createBotCommand('throne', async (params, {}) => {
                sendChat('Nyavarr has a throne including the ability to leave anonymous and surprise gifts. https://throne.me/navarr')
            }),

            createBotCommand('credits', async (params, {msg}) => {
                replyChat('You can find credits for everything used in stream at https://github.com/nyavarr/credits', msg.id)
            }, {aliases: ['credit']}),

            createBotCommand('merch', async (params, {msg}) => {
                replyChat('You\'re really considering buying some merch? nyavarShy You can find the storefront at https://shop.nyavarr.com/ - Post in the discord if you have more ideas!', msg.id)
            }, {aliases: ['shop', 'store']}),

            createBotCommand('bonkcount', async (params, {msg, userId}) => {
                const counterName = 'bonk';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        replyChat('Nyavarr has never been bonked.', msg.id);
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `Nyavarr has been bonked ${allCount} time${allCount > 1 ? 's' : ''}`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    replyChat(allString + userString, msg.id);
                }).catch((e) => {
                    console.error(e);
                    replyChat('I encountered an error grabbing the count.  Please try again later. The error has been logged.', msg.id);
                })
            }),

            createBotCommand('deercount', async (params, {msg, userId}) => {
                const counterName = 'deer';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        replyChat('Nyavarr has never been turned into a deer.', msg.id);
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `Nyavarr has been turned into a deer ${allCount} time${allCount > 1 ? 's' : ''}`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    replyChat(allString + userString, msg.id);
                }).catch((e) => {
                    console.error(e);
                    replyChat('I encountered an error grabbing the count.  Please try again later. The error has been logged.', msg.id);
                })
            }),

            createBotCommand('thrown', async (params, {msg, userId}) => {
                const counterName = 'thrown';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        replyChat('Nyavarr has never had anything thrown at them.', msg.id);
                        return;
                    }
                    const userCount = userCounter.get();
                    console.log(userCount);
                    const allString = `Nyavarr has had ${allCount} thing${allCount > 1 ? 's' : ''} thrown at him`;
                    const userString = userCount > 0 ? `, ${userCount} of them by you!` : '!';
                    replyChat(allString + userString, msg.id);
                }).catch((e) => {
                    console.error(e);
                    replyChat('I encountered an error grabbing the count.  Please try again later. The error has been logged.', msg.id);
                })
            }),

            createBotCommand('treats', async (params, {userId, msg}) => {
                const counterName = 'daily';
                Promise.all([
                    counterDb.getCounter(counterName),
                    counterDb.getUserCounter(counterName, userId)
                ]).then(([allCounter, userCounter]) => {
                    const allCount = allCounter.get();
                    if (allCount === 0) {
                        replyChat('Nobody has ever redeemed a daily treat nyavarTear', msg.id);
                        return;
                    }
                    const userCount = userCounter.get();
                    const allString = `${allCount} treat${allCount > 1 ? 's' : ''} have been given out`;
                    const userString = userCount > 0 ? `, ${userCount} of them to you!` : '!';
                    replyChat(allString + userString, msg.id);
                }).catch((e) => {
                    console.error(e);
                    replyChat('I encountered an error grabbing the count. Please try again later. The error has been logged.', msg.id);
                })
            }),

            createBotCommand('kofi', async (params, {msg}) => {
                replyChat('You can contribute via ko-fi at https://ko-fi.com/nyavarr - every little bit helps and I appreciate it!', msg.id)
            }, {aliases: ['ko-fi', 'tip']})
        ]
    })

    async function replyChat(message, replyToId = null) {
        await sendChat(message, false, replyToId);
    }

    async function sendChat(message, forSourceOnly = false, replyToId = null) {
        await apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
            try {
                let params = {};
                if (replyToId) {
                    params.replyParentMessageId = replyToId;
                }
                params.forSourceOnly = forSourceOnly;

                await ctx.chat.sendChatMessageAsApp(
                    process.env.BOT_USER_ID,
                    process.env.TWITCH_CHANNEL_ID,
                    message,
                    params
                );
            } catch (e) {
                console.error(e);
                await bot.say(process.env.TWITCH_CHANNEL_NAME, message)
            }
        });
    }

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
                bot.announce(broadcasterName, message).then();
            },
            (message) => {
                sendChat( `${message} (This.. shouldn't be possible)`, true).then();
            },
            broadcasterId
        ).then()
    })

    const twitchEventSubListener = new EventSubWsListener({apiClient})
    twitchEventSubListener.start()

    // Ad Break Starting
    twitchEventSubListener.onChannelAdBreakBegin(process.env.TWITCH_CHANNEL_ID, (event) => {
        const duration = moment.duration({s: event.durationSeconds}).humanize()
        bot.announce(
            process.env.TWITCH_CHANNEL_NAME,
            `We're taking a quick ad break. These are scheduled to keep pre-rolls off. See you in ${duration}!`
        ).then()
    })

    twitchEventSubListener.onChannelRedemptionAdd(process.env.TWITCH_CHANNEL_ID, (event) => {
        try {
            if (event.rewardTitle === 'Daily Treat') {
                const treatKey = getRandomArrayKey(availableTreatsList),
                    treat = availableTreatsList[treatKey];

                counterDb.incrementCounter('daily').then().catch((err) => console.error(err));
                counterDb.incrementCounter(`daily-${treat}`).then().catch((err) => console.error(err));
                counterDb.incrementUserCounter(`daily-${treat}`, event.userId).then().catch((err) => console.error(err));
                Promise.all([
                    counterDb.incrementUserCounter('daily', event.userId),
                    treatStreakDb.updateUserStreak(event.userId)
                ]).then(([counter, streakCounter]) => {
                    const phrase = [
                        `@${event.userDisplayName}`,
                        `Here's your ${moment.localeData().ordinal(counter.get())} treat - ${treat}! Thank you!`,
                    ]
                    if (streakCounter.get() > 1) {
                        phrase.push(`(STREAK x${streakCounter.get()})`)
                    }
                    phrase.push('nyavarHeart nyavarHeart nyavarHeart');
                    sendChat(phrase.join(' '), true);

                    if (treatStreakDb.getStreakIfRepaired(event.userId)) {
                        const phrase = [
                            `@${event.userDisplayName}`,
                            `nyavarBehave Your streak is broken, but if you redeem "Streak Repair" we'll restore it to a x${treatStreakDb.getStreakIfRepaired(event.userId)} streak nyavarThinking`
                        ];
                        sendChat(phrase.join(' '), true);
                    }

                }).catch((error) => {
                    console.error('Error Returned: ', error)
                    sendChat('Something went wrong redeeming your treat.  I\'m sorry nyavarTear', true);
                });
            }
            if (event.rewardTitle === "Streak Repair") {
                treatStreakDb.repairStreak(event.userId).then((streakCounter) => {
                    if (streakCounter === false) {
                        sendChat('Streak is not eligible for repair at this time.  Mods: Please refund the redeem', true);
                    } else {
                        sendChat(`@${event.userDisplayName} your streak has been repaired! nyavarHeadpats Thank you for your ${streakCounter.get()} stream loyalty! nyavarHeart`, true);
                    }
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
                    sendChat(unassembledText.join(' '), true);
                }).catch((error) => {
                    console.error(error)
                })
            }
            if (event.rewardTitle === 'Throw Something!') {
                counterDb.incrementUserCounter('thrown', event.userId).then(() => {
                }).catch((error) => {
                    console.error(error)
                })
                counterDb.incrementCounter('thrown').then(() => {
                }).catch((error) => {
                    console.error(error)
                })
            }
            if (event.rewardTitle === 'bonk') {
                counterDb.incrementUserCounter('bonk', event.userId).then(() => {
                }).catch((error) => {
                    console.error(error)
                })
                counterDb.incrementCounter('bonk').then(() => {
                }).catch((error) => {
                    console.error(error)
                })
            }
            if (event.rewardTitle === 'DEER!') {
                counterDb.incrementUserCounter('deer', event.userId).then(() => {
                }).catch((error) => {
                    console.error(error)
                })
                counterDb.incrementCounter('deer').then(() => {
                }).catch((error) => {
                    console.error(error)
                })
            }
        } catch (e) {
            console.error('Error Processing Reward Redeem', e);
        }
    })

    // Timers
    const generalTimerMessages = [
        'Did you know I have a throne?  I\'ve got neat and... interesting... things on there if you want to send me a gift!  https://throne.com/navarr',
        'Join the discord for schedule updates and optional going-live notifications! https://discord.gg/W6g5r4Wf2E',
        'Check out the TikTok for highlights you might have missed! https://tiktok.com/@nyavarr',
        'Please help me out!  It\'s hard to clip interesting or amusing moments when I\'m in the action, press the Clip button to start a clip!',
        'Do you like the stream?  Don\'t be so engrossed you forget to drop a follow!  It\'ll help you know about my upcoming streams.',
        'I work hard to keep my Twitch Schedule up to date.  Take a look and see what the future holds: https://twitch.tv/nyavarr/schedule',
        'ABWAH! We have MERCH!  Go check it out at https://shop.nyavarr.com/',
        'We\'re part of 🦇 CREATURE FEATURE 🦇 - An Aggressively Pro-LGBTQIA+ and Marginalized Peoples Safe Space. Learn more at https://twitter.com/CFeatureTTV',
        'This month we\'re supporting THE TREVOR PROJECT!  Donate to them at https://charity.nyavarr.com/'
    ]
    let generalTimerInterval = null
    /** @type {number} The index of the next message to send. */
    let generalTimerIndex = 0
    twitchEventSubListener.onStreamOnline(process.env.TWITCH_CHANNEL_ID, async (event) => {
        console.debug('onStreamOnline')

        treatStreakDb.updateLastStream().then().catch((error) => {
            console.error(error)
        });

        // Timed Messages
        clearInterval(generalTimerInterval)
        generalTimerInterval = setInterval(
            async () => {
                let maxIndex = generalTimerMessages.length - 1
                if (generalTimerIndex > maxIndex) {
                    generalTimerIndex = 0
                }
                apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    try {
                        await ctx.chat.sendChatMessageAsApp(
                            process.env.BOT_USER_ID,
                            process.env.TWITCH_CHANNEL_ID,
                            generalTimerMessages[generalTimerIndex],
                            {forSourceOnly: true}
                        );
                    } catch (e) {
                        console.error(e);
                        bot.say(process.env.TWITCH_CHANNEL_NAME, generalTimerMessages[generalTimerIndex])
                    }
                })
                generalTimerIndex++
            },
            convertMinutesToMilliseconds(10)
        )

        const announceStream = async () => {
            const stream = await event.getStream();
            if (stream === null) {
                setTimeout(announceStream, 500);
                return;
            }
            try {
                const game = (await event.getStream()).gameName
                const title = (await event.getStream()).title
                await apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
                    try {
                        await ctx.chat.sendAnnouncement(
                            process.env.TWITCH_CHANNEL_ID,
                            {
                                message: `Nyavarr is now live streaming ${game}: ${title}`,
                            }
                        )
                    } catch (e) {
                        console.error('Recoverable Error', e);
                    }
                })
            } catch (e) {
                console.error('Recoverable Error', e)
            }
        };

        announceStream().then();
        await resetDailyCounters()
    })

    twitchEventSubListener.onStreamOffline(process.env.TWITCH_CHANNEL_ID, () => {
        console.debug('onStreamOffline')
        clearInterval(generalTimerInterval)
    })

    twitchEventSubListener.onChannelRaidFrom(process.env.TWITCH_CHANNEL_ID, (event) => {
        console.debug('onChannelRaidTo')
        apiClient.asUser(process.env.BOT_USER_ID, async ctx => {
            try {
                await ctx.chat.sendAnnouncement(
                    process.env.TWITCH_CHANNEL_ID,
                    {
                        message: `${event.raidingBroadcasterDisplayName} has raided out to ${event.raidedBroadcasterDisplayName}!  Did you miss it?  Join at https://twitch.tv/${event.raidedBroadcasterName}`
                    }
                )
            } catch (e) {
                console.error('Recoverable Error', e);
            }
        })
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
