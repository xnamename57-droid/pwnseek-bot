const express = require("express");
const session = require("express-session");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const crypto = require("crypto");

// ================= CONFIG =================
const MAIN_OWNER_ID = "1116824300247339131";

// ================= EXPRESS =================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "pwnseek_secret_key",
  resave: false,
  saveUninitialized: false
}));

// ================= MONGO =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.error("MongoDB erreur:", err));

const licenseSchema = new mongoose.Schema({
  key: String,
  plan: String,
  expiresAt: Number,
  generatedBy: String,
  redeemedBy: String
});

const License = mongoose.model("License", licenseSchema);

// ================= AUTH =================
function isAuth(req, res, next) {
  if (req.session.logged) return next();
  res.redirect("/login");
}

// ================= LOGIN =================
app.get("/login", (req, res) => {
  res.send(`
    <h2>PwnSeek Admin Login</h2>
    <form method="POST">
      <input type="password" name="password" placeholder="Password"/>
      <button>Login</button>
    </form>
  `);
});

app.post("/login", (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.logged = true;
    return res.redirect("/panel");
  }
  res.send("Mot de passe incorrect");
});

// ================= PANEL =================
app.get("/panel", isAuth, async (req, res) => {
  const licenses = await License.find();

  const rows = licenses.map(l => `
    <tr>
      <td>${l.key}</td>
      <td>${l.plan}</td>
      <td>${l.redeemedBy || "Non utilisée"}</td>
      <td>
        <form method="POST" action="/delete">
          <input type="hidden" name="key" value="${l.key}"/>
          <button>Supprimer</button>
        </form>
      </td>
    </tr>
  `).join("");

  res.send(`
    <h1>PwnSeek Admin Panel</h1>

    <h3>Générer une licence</h3>
    <form method="POST" action="/generate">
      <select name="plan">
        <option value="1sem">1 semaine</option>
        <option value="1mois">1 mois</option>
        <option value="1ans">1 an</option>
        <option value="lifetime">Lifetime</option>
      </select>
      <button>Générer</button>
    </form>

    <h3>Licences</h3>
    <table border="1">
      <tr>
        <th>Key</th>
        <th>Plan</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
      ${rows}
    </table>
  `);
});

app.post("/generate", isAuth, async (req, res) => {

  function getExpiration(plan) {
    const now = Date.now();
    if (plan === "1sem") return now + 7 * 24 * 60 * 60 * 1000;
    if (plan === "1mois") return now + 30 * 24 * 60 * 60 * 1000;
    if (plan === "1ans") return now + 365 * 24 * 60 * 60 * 1000;
    if (plan === "lifetime") return null;
  }

  const key = "pwn_" + crypto.randomBytes(8).toString("hex");

  await License.create({
    key,
    plan: req.body.plan,
    expiresAt: getExpiration(req.body.plan),
    generatedBy: "Panel",
    redeemedBy: null
  });

  res.redirect("/panel");
});

app.post("/delete", isAuth, async (req, res) => {
  await License.deleteOne({ key: req.body.key });
  res.redirect("/panel");
});

app.listen(PORT, () => {
  console.log("Panel web lancé sur port " + PORT);
});

// ================= DISCORD BOT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("Bot connecté en tant que " + client.user.tag);
});

function embed(color, title, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args[0]?.toLowerCase();

  // ===== REDEEM =====
  if (cmd === "!redeem") {
    const key = args[1];

    const license = await License.findOne({ key });

    if (!license)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé invalide")] });

    if (license.redeemedBy)
      return message.reply({ embeds: [embed("#ff0000", "Erreur", "Clé déjà utilisée")] });

    license.redeemedBy = message.author.tag;
    await license.save();

    return message.reply({ embeds: [embed("#00ff99", "Succès", "Licence activée")] });
  }
});

client.login(process.env.TOKEN);
