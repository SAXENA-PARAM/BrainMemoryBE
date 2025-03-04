"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTime = getTime;
exports.getDate = getDate;
exports.createEmbeddings = createEmbeddings;
exports.createQueryEmbeddings = createQueryEmbeddings;
exports.cosineSimilarity = cosineSimilarity;
exports.giveYoutubeInfo = giveYoutubeInfo;
exports.giveTweetInfo = giveTweetInfo;
exports.giveWebsiteInfo = giveWebsiteInfo;
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const generative_ai_1 = require("@google/generative-ai");
const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const axios_1 = __importDefault(require("axios"));
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "text-embedding-004",
});
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
function getTime() {
    // console.log(x.format('HH:mm:ss'));
    const x = (0, dayjs_1.default)().tz('Asia/Kolkata');
    return x.format('HH:mm:ss');
}
function getDate() {
    // console.log(x.format('DD-MM-YYYY'));
    const x = (0, dayjs_1.default)().tz('Asia/Kolkata');
    return x.format('DD-MM-YYYY');
}
function createEmbeddings(memoryInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const input = `
        ${(_a = memoryInfo.title) !== null && _a !== void 0 ? _a : "N/A"}
        ${(_b = memoryInfo.description) !== null && _b !== void 0 ? _b : "N/A"}
        ${memoryInfo.creatorName ? `Creator: ${memoryInfo.creatorName}` : ""}
    `;
        const result = yield model.embedContent(input.trim());
        return result.embedding.values;
    });
}
function createQueryEmbeddings(query) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield model.embedContent(query.trim());
        return result.embedding.values;
    });
}
function cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, v1, i) => sum + v1 * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
    return dotProduct / (magnitude1 * magnitude2);
}
function giveYoutubeInfo(link) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = link.split('=')[1];
        const apiKey = process.env.YOUTUBE_API_KEY;
        const res = yield axios_1.default.get(`https://www.googleapis.com/youtube/v3/videos?id=${id}&key=${apiKey}&part=snippet`);
        const data = res.data;
        const title = data.items[0].snippet.title;
        const description = data.items[0].snippet.description;
        const channelName = data.items[0].snippet.channelTitle;
        return { title, description, channelName };
    });
}
function giveTweetInfo(link) {
    return __awaiter(this, void 0, void 0, function* () {
        const browser = yield puppeteer_extra_1.default.launch({
            headless: true, // Faster headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Speeds up execution
        });
        const page = yield browser.newPage();
        yield page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        yield page.goto(link, { waitUntil: "domcontentloaded" });
        yield page.waitForSelector('div[data-testid="tweetText"]', { visible: true });
        yield page.waitForSelector('div[data-testid="User-Name"]', { visible: true });
        const tweet = yield page.$eval('div[data-testid="tweetText"]', el => el.innerText).catch(() => "N/A");
        const username = yield page.$eval('div[data-testid="User-Name"]', el => el.innerText).catch(() => "N/A");
        yield browser.close();
        return { description: tweet, creatorName: username };
    });
}
function giveWebsiteInfo(link) {
    return __awaiter(this, void 0, void 0, function* () {
        const browser = yield puppeteer_extra_1.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = yield browser.newPage();
        // Block unnecessary resources (images, stylesheets, fonts)
        yield page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        yield page.goto(link, { waitUntil: "domcontentloaded" });
        // Extract metadata
        const title = yield page.title();
        const description = yield page.$eval('meta[name="description"]', el => el.content).catch(() => "N/A");
        const logoUrl1 = yield page.$eval('meta[property="og:image"]', el => el.content).catch(() => undefined);
        const logoUrl2 = yield page.$eval('meta[name="twitter:image"]', el => el.content).catch(() => undefined);
        yield browser.close();
        return {
            title,
            description,
            logoUrl: logoUrl1 || logoUrl2 || "N/A"
        };
    });
}
