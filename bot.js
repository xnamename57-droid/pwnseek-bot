const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("PwnSeek System Online"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("MongoDB erreur:", err));

// ===== Schema =====
const licenseSchema = new mongoose.Schema({
  key: String,
  plan: String,
  expiresAt: Number,
  generatedBy: String,
  redeemedBy: String
});

const License = mongoose.model("License", licenseSchema);

// ===== Discord Bot =====
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

// ===== Helpers =====

function embedSuccess(title, description) {
  return new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "PwnSeek Licensing System" })
    .setTimestamp();
}

function embedError(description) {
  return new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle("Erreur")
    .setDescription(description)
    .setTimestamp();
}

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

function sendLog(content) {
  const channel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!channel) return;
  channel.send({ embeds: [embedSuccess("Log", content)] });
}

// ===== Cooldown simple =====
const cooldown = new Set();

// ===== Command Handler =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  if (cooldown.has(message.author.id)) return;
  cooldown.add(message.author.id);
  setTimeout(() => cooldown.delete(message.author.id), 2000);

  // ===== HELP =====
  if (cmd === "!help") {
    const embed = new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle("PwnSeek - Commandes")
      .addFields(
        { name: "!gen 1 semaine | 1 mois | 1 ans | lifetime", value: "Générer une licence (Owner uniquement)" },
        { name: "!redeem <key>", value: "Activer une licence" },
        { name: "!check <key>", value: "Vérifier une licence" },
        { name: "!list", value: "Voir toutes les licences (Owner)" },
        { name: "!disable <key>", value: "Supprimer une licence (Owner)" }
      )
      .setFooter({ text: "PwnSeek Professional System" })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ===== GENERATE =====
  if (cmd === "!gen") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embedError("Permission refusée.")] });

    let plan;
    if (args[1] === "1" && args[2] === "semaine") plan = "1_week";
    if (args[1] === "1" && args[2] === "mois") plan = "1_month";
    if (args[1] === "1" && args[2] === "ans") plan = "1_year";
    if (args[1] === "lifetime") plan = "lifetime";

    if (!plan)
      return message.reply({ embeds: [embedError("Plan invalide.")] });

    const key = generateKey();
    const expiresAt = getExpiration(plan);

    await License.create({
      key,
      plan,
      expiresAt,
      generatedBy: message.author.tag,
      redeemedBy: null
    });

    sendLog(`Nouvelle licence générée\nClé: ${key}\nPlan: ${plan}`);

    return message.reply({
      embeds: [
        embedSuccess(
          "Licence générée",
          `Clé: \`${key}\`\nPlan: ${plan}\nStatut: Non activée`
        )
      ]
    });
  }

  // ===== REDEEM =====
  if (cmd === "!redeem") {
    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embedError("Veuillez fournir une clé.")] });

    const license = await License.findOne({ key });
    if (!license)
      return message.reply({ embeds: [embedError("Clé invalide.")] });

    if (license.redeemedBy)
      return message.reply({ embeds: [embedError("Clé déjà utilisée.")] });

    if (license.expiresAt && Date.now() > license.expiresAt)
      return message.reply({ embeds: [embedError("Clé expirée.")] });

    license.redeemedBy = message.author.tag;
    await license.save();

    return message.reply({
      embeds: [
        embedSuccess("Activation réussie", "Votre licence est maintenant active.")
      ]
    });
  }

  // ===== CHECK =====
  if (cmd === "!check") {
    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embedError("Veuillez fournir une clé.")] });

    const license = await License.findOne({ key });
    if (!license)
      return message.reply({ embeds: [embedError("Clé invalide.")] });

    return message.reply({
      embeds: [
        embedSuccess(
          "Informations licence",
          `Clé: \`${license.key}\`\nPlan: ${license.plan}\nGénérée par: ${license.generatedBy}\nRedeem: ${license.redeemedBy || "Non utilisée"}`
        )
      ]
    });
  }

  // ===== LIST =====
  if (cmd === "!list") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embedError("Permission refusée.")] });

    const licenses = await License.find();
    if (!licenses.length)
      return message.reply({ embeds: [embedError("Aucune licence active.")] });

    let content = "";
    licenses.forEach(l => {
      content += `\`${l.key}\` | ${l.plan} | ${l.redeemedBy || "Non utilisée"}\n`;
    });

    return message.reply({
      embeds: [embedSuccess("Licences actives", content)]
    });
  }

  // ===== DISABLE =====
  if (cmd === "!disable") {
    if (message.author.id !== MAIN_OWNER_ID)
      return message.reply({ embeds: [embedError("Permission refusée.")] });

    const key = args[1];
    if (!key)
      return message.reply({ embeds: [embedError("Veuillez fournir une clé.")] });

    await License.deleteOne({ key });

    return message.reply({
      embeds: [embedSuccess("Licence supprimée", `Clé: \`${key}\` supprimée.`)]
    });
  }

});

client.login(TOKEN);
