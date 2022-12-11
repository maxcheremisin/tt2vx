import { Telegraf } from 'telegraf'
import express from 'express'
import axios from 'axios'
import { createDeferredPromise } from './utils/deferredPromise'
import { wait } from './utils/wait'

const api = axios.create({
    timeout: 5000,
    timeoutErrorMessage: 'TT2VX_TIMEOUT',
    maxRedirects: 1,
})

const port = process.env.PORT || 8080

if (!process.env.BOT_TOKEN) {
    throw new Error('Provide process.env.BOT_TOKEN')
}

const bot = new Telegraf(process.env.BOT_TOKEN)

const tiktokDomain = 'https://www.tiktok.com'
const vxDomain = 'https://www.vxtiktok.com'

function extractUrl(text: string) {
    return text.match(/\bhttps?:\/\/\S+/gi)?.[0]
}

function removeSearch(url: string) {
    return url.replace(/\?.*/, '')
}

function tryExtractPathFromRequest(request: { path: string }) {
    try {
        return tiktokDomain + removeSearch(request.path)
    } catch {
        console.log('No path in request', { request })
        return
    }
}

function tryExtractCurrentUrlFromError(error: any) {
    try {
        return removeSearch(error.request._currentUrl)
    } catch {
        console.log('No url in error', { error })
        return
    }
}

async function tryExtractPathnameFromRedirectOptions(url: string) {
    const deferredPathname = createDeferredPromise<string>()

    const requestPromise = api.get(url, {
        beforeRedirect(options) {
            deferredPathname.resolve(options.pathname)
        },
    })

    const timeout = wait(5000)
    let maybePathname = await Promise.race([deferredPathname.promise, timeout])

    if (maybePathname) {
        const silencedTimeoutRequestPromise = requestPromise.catch((error) => {
            if (error.message === api.defaults.timeoutErrorMessage) {
                // silence timeout errors if redirect pathname is handled
                return null
            } else {
                throw error
            }
        })

        const result = tiktokDomain + maybePathname

        return [result, silencedTimeoutRequestPromise] as const
    }

    console.log('No pathname from redirect extracted')

    return [null, requestPromise] as const
}

async function handleShortTiktokUrl(url: string) {
    try {
        const [result, requestPromise] = await tryExtractPathnameFromRedirectOptions(url)

        if (result != null) {
            return result
        }

        const res = await requestPromise
        return tryExtractPathFromRequest(res.request)
    } catch (error) {
        if (!axios.isAxiosError(error)) throw error

        const result = tryExtractCurrentUrlFromError(error)
        if (result) {
            return result
        }
        throw error
    }
}

async function extractTiktokUrl(url: string) {
    if (!url.includes('tiktok')) return

    if (url.includes(tiktokDomain)) {
        return url
    }

    return handleShortTiktokUrl(url)
}

async function extractVxUrl(text: string) {
    const url = extractUrl(text)
    if (!url) {
        console.log('No url', url)
        return [] as const
    }

    const tiktokUrl = await extractTiktokUrl(url)
    if (!tiktokUrl) {
        console.log('No tiktok url', tiktokUrl)
        return [] as const
    }

    const vxUrl = tiktokUrl.replace(tiktokDomain, vxDomain)

    return [vxUrl, url] as const
}

const repliedUrlsByChat = new Map<number, Set<string>>()

function getReplies(chatId: number) {
    let repliedUrls = repliedUrlsByChat.get(chatId)
    if (!repliedUrls) {
        repliedUrls = new Set<string>()
        repliedUrlsByChat.set(chatId, repliedUrls)
    }
    return repliedUrls
}

bot.on(['message', 'edited_message'], async (ctx) => {
    try {
        const chatId = ctx.chat.id
        const replies = getReplies(chatId)

        const message = 'edited_message' in ctx.update ? ctx.update.edited_message : ctx.update.message

        let text = ''
        if (typeof message === 'string') text = message
        if ('caption' in message && typeof message.caption === 'string') text = message.caption
        if ('text' in message) text = message.text

        const [vxUrl, originalUrl] = await extractVxUrl(text)

        if (!vxUrl || !originalUrl) return
        if (replies.has(vxUrl)) return

        replies.add(vxUrl)

        await ctx.sendMessage(text.replace(originalUrl, vxUrl))
        await ctx.deleteMessage(message.message_id)
    } catch (e) {
        console.error(e)
    }
})

const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0; url='https://t.me/tt2vx_bot'" />
    <title>tt2vx</title>
  </head>
  <body>
    <p>
        <a href="https://t.me/tt2vx_bot">tt2vx_bot</a>
    </p>
  </body>
</html>
`

if (process.env.NODE_ENV === 'production') {
    bot.createWebhook({ domain: 'tt2vx.onrender.com' })
        .then((webhook) => {
            const app = express()
            app.use(webhook)
            app.get('/', (req, res) => res.type('html').send(html))
            app.listen(port, () => console.log(`Server is listening on port ${port}`))
        })
        .catch((err) => {
            console.error('Create webhook error', err)
        })
} else {
    bot.launch().then(() => console.log(`Server is running locally`))
}

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
