import { Telegraf } from 'telegraf'
import express from 'express'
import axios from 'axios'

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

async function extractTiktokUrl(url: string) {
    if (!url.includes('tiktok')) return

    if (url.includes(tiktokDomain)) {
        return url
    }

    const shortUrlRes = await axios.get(url)
    const urlPath = shortUrlRes.request.path
    if (typeof urlPath !== 'string') return

    return tiktokDomain + urlPath.replace(/\?.*/, '')
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
    <meta http-equiv="refresh" content="5; url='https://t.me/tt2vx_bot'" />
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
    bot.launch()
}

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
