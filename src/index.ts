import Koa from "koa";
import koaBody from "koa-body";
// @ts-ignore
import Meter from "@uswitch/koa-prometheus";
import { Bot, Context as BaseContext, webhookCallback } from "grammy";
import { limit } from "@grammyjs/ratelimiter";
import { I18n, I18nContext } from "@grammyjs/i18n";

// Set up metrics collection
const meters = Meter(
  [
    {
      name: "root_get_requests",
      help: "How many times a GET request went to /",
      type: "Counter",
    },
    {
      name: "parked_bot_update",
      help: "How many times a parked bot received an update",
      type: "Counter",
      labelNames: [{ key: "method" }],
    },
  ],
  { loadDefaults: false }
);

interface ContextWithI18N extends BaseContext {
  readonly i18n: I18nContext;
}

const bot = new Bot<ContextWithI18N>("we-have-no-token", {
  // Write down some generic botInfo to avoid making a getMe call, as we want to answer for multiple bots
  botInfo: {
    can_join_groups: true,
    can_read_all_group_messages: true,
    first_name: "blah",
    id: 123,
    is_bot: true,
    supports_inline_queries: true,
    username: "botbot",
    language_code: "bo",
    last_name: "bot",
  },
  client: {
    // Always send the reply via the webhook response, since we don't know all bot's tokens:
    canUseWebhookReply: (_method) => true,
  },
});

const i18n = new I18n({
  defaultLanguageOnMissing: true, // implies allowMissing = true
  directory: "locales",
  defaultLanguage: "en",
  useSession: false,
});

bot.use(i18n.middleware());

// Apply a rate-limit of max 1 req/2.5 seconds on incoming updates
bot.use(limit({ timeFrame: 2500 }));

const defaultOptions = {
  parse_mode: "HTML" as "HTML",
  reply_markup: { remove_keyboard: true as true },
};

// Handle commands
bot.command("start", async (ctx) => {
  ctx.reply(ctx.i18n.t("default"), defaultOptions);
  meters.parkedBotUpdate.labels("/start").inc(1);
});
bot.command("help", async (ctx) => {
  ctx.reply(ctx.i18n.t("default"), defaultOptions);
  meters.parkedBotUpdate.labels("/help").inc(1);
});
bot.command("settings", async (ctx) => {
  ctx.reply(ctx.i18n.t("default"), defaultOptions);
  meters.parkedBotUpdate.labels("/settings").inc(1);
});

// Handle other messages
bot.on("message", async (ctx) => {
  // Don't answer to non-command messages in any other chat than private to avoid spamming.
  if (ctx.chat.type === "private") {
    ctx.reply(ctx.i18n.t("default"), defaultOptions);
    meters.parkedBotUpdate.labels("generic_message").inc(1);
  }
});

// Handle Callback queries (presses of inline buttons)
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: ctx.i18n.t("callback_query_alert_text"),
    show_alert: true,
    cache_time: 5,
  });

  meters.parkedBotUpdate.labels("callback_query").inc(1);
});

bot.on("inline_query", async (ctx) => {
  await ctx.answerInlineQuery([], {
    cache_time: 5,
    is_personal: false,
    switch_pm_parameter: "from_inline_query",
    switch_pm_text: ctx.i18n.t("inline_query_alert_text"),
  });
  meters.parkedBotUpdate.labels("inline_query").inc(1);
});

// Set up webserver
const app = new Koa();
app.use(koaBody());

// Expose a metrics collection endpoint
app.use(async (ctx, next) => {
  if (ctx.path === "/supersecretmetrics") {
    ctx.body = meters.print();
  } else {
    return next();
  }
});

// Workaround: Tell telegram that we are indeed returning JSON, so that it executes the returned api method.
app.use(async (ctx, next) => {
  ctx.set("Content-Type", "application/json");
  await next();
});

app.use(async (ctx, next) => {
  if (ctx.method.toLocaleLowerCase() === "get") {
    ctx.body =
      '{"hint": "You should not be here. This place is not for humans."}';
    meters.rootGetRequests.inc(1);
  } else {
    return next();
  }
});

// Route web request to the bot webhook callback
app.use(webhookCallback(bot, "koa"));

// Start the webserver
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
app.listen(port, hostname, () => {
  console.log(`Listening on http://${hostname}:${port}`);
});
