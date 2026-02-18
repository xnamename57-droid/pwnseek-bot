const { Client, GatewayIntentBits } = require("discord.js");
const crypto = require("crypto");

const TOKEN = process.env.TOKEN;
const MAIN_OWNER_ID = "1116824300247339131";
const LOG_CHANNEL_ID = "1473501966377422930";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

console.log("Bot démarre...");

client.once("ready", () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

function sendLog(content) {
  const channel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!channel) return;
  channel.send(content);
}

let owners = new Set();
let licenses = [];

function generateKey() {
  return "pwn_" + crypto.randomBytes(8).toString("hex");
}

function getExpiration(plan) {
  const now = Date.now();
  if (plan === "1_week") return now + 7 * 24 * 60 * 60 * 1000;
  if (plan === "1_month") return now + 30 * 24 * 60 * 60 * 1000;
  if (plan === "1_year") return now + 365 * 24 * 60 * 60 * 1000;
  if (plan === "lifetime") return null;
}

function isOwner(id) {
  return id === MAIN_OWNER_ID || owners.has(id);
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  // ===== ADD OWNER =====
  if (cmd === "!owner") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply("Pas autorisé");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Mentionne un utilisateur");

    owners.add(user.id);
    return message.reply("Owner ajouté");
  }

  // ===== GENERATE =====
  if (cmd === "!gen") {
    if (!isOwner(message.author.id)) return;

    let plan;

    if (args[1] === "1" && args[2] === "semaine") plan = "1_week";
    if (args[1] === "1" && args[2] === "mois") plan = "1_month";
    if (args[1] === "1" && args[2] === "ans") plan = "1_year";
    if (args[1] === "lifetime") plan = "lifetime";

    if (!plan) return message.reply("Plan invalide");

    const key = generateKey();
    const expiresAt = getExpiration(plan);

    licenses.push({
      key,
      plan,
      expiresAt,
      generatedBy: message.author.tag,
      redeemedBy: null
    });

    sendLog(
`GEN
Key: ${key}
Plan: ${plan}
Gen par: ${message.author.tag}`
    );

    return message.reply(
`Key générée: ${key}

Merci d'avoir payer sur PwnSeek`
    );
  }

  // ===== REDEEM =====
  if (cmd === "!redeem") {
    const key = args[1];
    if (!key) return message.reply("Donne une key");

    const license = licenses.find(l => l.key === key);
    if (!license) return message.reply("Key invalide");

    if (license.redeemedBy)
      return message.reply("Key déjà utilisée");

    if (license.expiresAt && Date.now() > license.expiresAt)
      return message.reply("Key expirée");

    license.redeemedBy = message.author.tag;

    sendLog(
`REDEEM
Key: ${key}
Redeem par: ${message.author.tag}`
    );

    return message.reply("Key activée");
  }

  // ===== CHECK =====
  if (cmd === "!check") {
    const key = args[1];
    if (!key) return message.reply("Donne une key");

    const license = licenses.find(l => l.key === key);
    if (!license) return message.reply("Key invalide");

    if (license.expiresAt && Date.now() > license.expiresAt)
      return message.reply("Key expirée");

    return message.reply(
`Valide
Plan: ${license.plan}
Générée par: ${license.generatedBy}
Redeem par: ${license.redeemedBy || "Non utilisée"}`
    );
  }

  // ===== LIST =====
  if (cmd === "!list") {
    if (!isOwner(message.author.id)) return;

    if (licenses.length === 0)
      return message.reply("Aucune key active");

    let msg = "Keys actives:\n\n";

    licenses.forEach(l => {
      msg += `Key: ${l.key}\n`;
      msg += `Plan: ${l.plan}\n`;
      msg += `Gen par: ${l.generatedBy}\n`;
      msg += `Redeem: ${l.redeemedBy || "Non utilisée"}\n\n`;
    });

    return message.reply(msg);
  }

  // ===== DISABLE =====
  if (cmd === "!disable") {
    if (!isOwner(message.author.id)) return;

    const key = args[1];
    if (!key) return message.reply("Donne une key");

    const index = licenses.findIndex(l => l.key === key);
    if (index === -1) return message.reply("Key invalide");

    licenses.splice(index, 1);

    sendLog(
`DELETE
Key: ${key}
Supprimée par: ${message.author.tag}`
    );

    return message.reply(`Key supprimée: ${key}`);
  }

});

client.login(TOKEN);
