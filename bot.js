const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("PwnSeek Bot Online"));
app.listen(PORT, () => console.log("Web server running on " + PORT));

console.log("Script lancé");

// ================= MONGO =================

async function connectMongo() {
  try {
    console.log("Connexion Mongo...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connecté");
  } catch (err) {
    console.error("Erreur MongoDB:", err);
  }
}

const licenseSchema = new mongoose.Schema({
  key: String,
  plan: String,
  expiresAt: Number,
  generatedBy: String,
  redeemedBy: String
});

const License = mongoose.model("License", licenseSchema);

// ================= DISCORD =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const MAIN_OWNER_ID = "1116824300247339131";

client.once("ready", () => {
  console.log("Bot connecté en tant que " + client.user.tag);
});

// ================= HELPERS =================

function embed(color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PwnSeek Licensing System" })
    .setTimestamp();
}

function generateKey() {
  return "pwn_" + crypto.randomBytes(8).toString("hex");
}

function getExpiration(plan) {
  const now = Date.now();
  if (plan === "1sem") return now + 7 * 24 * 60 * 60 * 1000;
  if (plan === "1mois") return now + 30 * 24 * 60 * 60 * 1000;
  if (plan === "1ans") return now + 365 * 24 * 60 * 60 * 1000;
  if (plan === "lifetime") return null;
  return null;
}

// ================= COMMANDES =================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  // HELP
  if (cmd === "!help") {
    return message.reply({
      embeds: [
        embed(
          "#2b2d31",
          "Commandes",
          "`!gen 1sem`\n`!gen 1mois`\n`!gen 1ans`\n`!gen lifetime`\n`!redeem <key>`\n`!check <key>`\n`!disable <key>`\n`!list`\n`!vouch`"
        )
      ]
    });
  }

  // GEN
  if (cmd === "!gen") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Permission refusée")] });

    const plan = args[1];
    if (!["1sem", "1mois", "1ans", "lifetime"].includes(plan))
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Plan invalide")] });

    const key = generateKey();
    const expiresAt = getExpiration(plan);

    await License.create({
      key,
      plan,
      expiresAt,
      generatedBy: message.author.tag,
      redeemedBy: null
    });

    return message.reply({
      embeds: [
        embed("#00ff99", "Licence générée",
          `Clé : \`${key}\`\nPlan : ${plan}\nStatut : Non utilisée`)
      ]
    });
  }

  // REDEEM
  if (cmd === "!redeem") {
    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Veuillez fournir une clé")] });

    const license = await License.findOne({ key });
    if (!license)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé invalide")] });

    if (license.redeemedBy)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé déjà utilisée")] });

    if (license.expiresAt && Date.now() > license.expiresAt)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé expirée")] });

    license.redeemedBy = message.author.tag;
    await license.save();

    return message.reply({
      embeds: [embed("#00ff99", "Activation réussie", "Licence activée")]
    });
  }

  // CHECK
  if (cmd === "!check") {
    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Veuillez fournir une clé")] });

    const license = await License.findOne({ key });
    if (!license)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé invalide")] });

    return message.reply({
      embeds: [
        embed("#2b2d31", "Informations licence",
          `Clé : \`${license.key}\`\nPlan : ${license.plan}\nRedeem : ${license.redeemedBy || "Non utilisée"}`)
      ]
    });
  }

  // LIST
  if (cmd === "!list") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Permission refusée")] });

    const licenses = await License.find();
    if (!licenses.length)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Aucune licence")] });

    const text = licenses.map(l =>
      `\`${l.key}\` | ${l.plan} | ${l.redeemedBy || "Non utilisée"}`
    ).join("\n");

    return message.reply({
      embeds: [embed("#2b2d31", "Licences actives", text)]
    });
  }

  // DISABLE
  if (cmd === "!disable") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Permission refusée")] });

    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Veuillez fournir une clé")] });

    await License.deleteOne({ key });

    return message.reply({
      embeds: [embed("#ffaa00", "Licence supprimée", `Clé : \`${key}\` supprimée`)]
    });
  }

  // VOUCH
  if (cmd === "!vouch") {
    return message.reply({
      embeds: [embed("#00ff99", "Merci", "Votre avis compte ❤️")]
    });
  }

});

// ================= START =================

async function start() {
  await connectMongo();
  await client.login(process.env.TOKEN);
}

start();
