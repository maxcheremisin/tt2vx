import {Telegraf} from 'telegraf'
import axios from 'axios'

if (!process.env.BOT_TOKEN) {
    throw new Error('Provide process.env.BOT_TOKEN')
}

const bot = new Telegraf(process.env.BOT_TOKEN)

const tiktokFullUrl = 'https://www.tiktok.com'
const vxUrl = 'https://www.vxtiktok.com'

function extractUrl(text: string) {
    return text.match(/\bhttps?:\/\/\S+/gi)?.[0]
}

async function extractTiktokUrl(url: string) {
    if (!url.includes('tiktok')) return

    if (url.includes(tiktokFullUrl)) {
        return url
    }

    const shortUrlRes = await axios.get(url)
    const fullUrlPath = shortUrlRes.request.path
    if (typeof fullUrlPath !== "string") return

    return tiktokFullUrl + fullUrlPath.replace(/\?.*/, '')
}

async function extractVxUrl(text: string) {
    const url = extractUrl(text)
    if (!url) {
        console.log('No url', url)
        return
    }

    const tiktokUrl = await extractTiktokUrl(url)
    if (!tiktokUrl) {
        console.log('No tiktok url', tiktokUrl)
        return
    }

    return tiktokUrl.replace(tiktokFullUrl, vxUrl)
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

bot.on(['message', 'edited_message'], async ctx => {
    try {
        const chatId = ctx.chat.id
        const replies = getReplies(chatId)

        const message = 'edited_message' in ctx.update ? ctx.update.edited_message : ctx.update.message

        let text = ''
        if (typeof message === "string") text = message
        if ('text' in message) text = message.text

        const vxUrl = await extractVxUrl(text)
        if (!vxUrl) return
        if (replies.has(vxUrl)) return

        replies.add(vxUrl)
        await ctx.reply(vxUrl, {reply_to_message_id: message.message_id})
    } catch (e) {
        console.error(e)
    }
})

bot.launch().then(() => {
    console.log('Bot is started')
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
