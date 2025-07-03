import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Sequelize, DataTypes, Op } from "sequelize";
import bodyParser from "body-parser";
import Telnyx from "telnyx";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from 'cookie-parser';
import { schema } from "./schema.js";

const JWT_SECRET = process.env.JWT_TOKEN;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const telnyx = Telnyx(process.env.TELNYX_API_KEY);
let Admin, Messages, Profiles, Threads, Permissions;

const sequelize = new Sequelize("database", process.env.DB_USER, process.env.DB_PASS, {
  host: "0.0.0.0",
  dialect: "sqlite",
  pool: { max: 5, min: 0, idle: 10000 },
  storage: ".data/database.sqlite",
});

sequelize.authenticate()
  .then(() => {
    console.log("Database connected.");
    //build({ force: true }); //{ force: true }
    init();
  })
  .catch((err) => console.error("DB connection failed:", err));

async function init() {
  Admin = sequelize.define("admins", schema.Admin);
  Profiles = sequelize.define("profiles", schema.Profiles);
  Messages = sequelize.define("messages", schema.Messages);
  Threads = sequelize.define("threads", schema.Threads);
  Permissions = sequelize.define("permissions", schema.Permissions);

  Threads.hasMany(Messages, { foreignKey: "threadId" });
  Messages.belongsTo(Threads);
  Profiles.hasMany(Threads, { foreignKey: "profileId" });
  Threads.belongsTo(Profiles);
  Profiles.hasMany(Messages, { foreignKey: "profileId" });
  Messages.belongsTo(Profiles);
}

async function build(reset) {
  console.log(process.env.DEFAULT_ADMIN_PW);
  const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PW, 10);
  await Admin.sync(reset);
  await Admin.create({ name: process.env.DEFAULT_ADMIN_USER, username: process.env.DEFAULT_ADMIN_USERNAME, password: hashedPassword, active: 1 });

  await Profiles.sync(reset);
  const { data: numbers } = await telnyx.phoneNumbers.list();

  for (const num of numbers) {
    if (num.messaging_profile_id) {
      await Profiles.create({
        e164: num.phone_number,
        display: `+1-${num.phone_number.slice(2, 5)}-${num.phone_number.slice(5)}`,
        id: num.messaging_profile_id,
      });
    }
  }

  await Promise.all([
    Messages.sync(reset),
    Threads.sync(reset),
    Permissions.sync(reset),
  ]);
}

const authenticateToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) return res.render("login", { error: "User not logged in" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.render("login", { error: "Invalid credentials" });
    req.user = user;
    next();
  });
};

// Routes
app.get("/", (req, res) => res.render("login", { error: null }));

app.post("/auth", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).render("login", { error: "Username and password are required" });

  const user = await Admin.findOne({ where: { username } });

  const valid = user && (await bcrypt.compare(password, user.password));
  if (!valid) return res.status(400).render("login", { error: "Invalid username or password" });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400000, // 1 day
  });

  return res.redirect("/dashboard");
});

app.get("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.redirect("/");
});

app.post("/register", authenticateToken, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Username and password are required");

  try {
    await Admin.create({ username, password: await bcrypt.hash(password, 10) });
    res.status(201).send("User registered");
  } catch {
    res.status(400).send("Username already exists");
  }
});

//app.get("/dashboard", (req, res) => res.render("index", { threadId: "NULL" }));
app.get("/dashboard", authenticateToken, async (req, res) => {
  res.render("index", { threadId: "NULL" });
});

app.get("/get-nums", authenticateToken, async (req, res) => {
  const numbers = await Profiles.findAll({ where: { active: true } });
  res.json({ numbers });
});

app.post("/send-sms", authenticateToken, async (req, res) => {
  const { sender, recipient, content } = req.body;

  try {
    const message = await Telnyx.messages.create({ from: sender, to: recipient, text: content });
    //await Messages.create({ sender, recipient, content });
    res.status(200).send({ success: true, message: "SMS sent", data: message });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to send SMS", error: error.message });
  }
});

const forwardSMS = (from, to, text) => {
  telnyx.messages.create({
    from: to,
    to: from,
    text,
    use_profile_webhooks: false
  });
};

app.post("/webhook/sms", async (req, res) => {
  const { from, to, text, messaging_profile_id, direction } = req.body.data.payload;
  const recipients = [...to.map(n => n.phone_number), from.phone_number].sort();

  if (direction === "inbound") {
    if (
      (from.phone_number === process.env.DEFAULT_ADMIN_E164 || from.phone_number === process.env.FORWARDING_E164) &&
      text.startsWith("[+") && text[14] === ':'
    ) {
      forwardSMS(text.slice(1, 13), to[0].phone_number, text.slice(16));
    } else {
      forwardSMS(process.env.FORWARDING_E164, to[0].phone_number, `[${from.phone_number}]: ${text}`);
    }
  }

  try {
    const profile = await Profiles.findOne({ where: { id: messaging_profile_id } });
    const profileNumber = profile?.e164;
    if (profileNumber) {
      const index = recipients.indexOf(profileNumber);
      if (index > -1) recipients.splice(index, 1);
    }

    if (["delivered", "webhook_delivered"].includes(to[0].status)) {
      const [thread] = await Threads.findOrCreate({
        where: {
          profileId: messaging_profile_id,
          recipients: JSON.stringify(recipients),
        },
      });

      await Messages.create({
        threadId: thread.id,
        sender: from.phone_number,
        profileId: messaging_profile_id,
        recipients: JSON.stringify(recipients),
        content: text,
      });

      res.status(200).send({ success: true, message: "SMS received" });
    }
  } catch (error) {
    res.status(500).send({ success: false, message: "Error processing SMS", error: error.message });
  }
});

app.post("/threads", authenticateToken, async (req, res) => {
  const filter = req.body.filter || "";
  try {
    const messages = await Messages.findAll({
      order: sequelize.literal("max(messages.createdAt) DESC"),
      group: "threadId",
      where: { recipients: { [Op.substring]: filter } },
      include: [Threads, Profiles],
    });
    res.json(messages);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch threads", error: error.message });
  }
});

app.get("/messages/:threadId", (req, res) => {
  res.render("index", { threadId: req.params.threadId });
});

app.post("/messages/:threadId", authenticateToken, async (req, res) => {
  try {
    const messages = await Messages.findAll({
      where: { threadId: req.params.threadId },
      order: [["createdAt", "ASC"]],
      include: [Threads, Profiles],
    });
    res.json(messages);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch messages", error: error.message });
  }
});

app.get("/raw/messages", authenticateToken, async (req, res) => {
  try {
    const messages = await Messages.findAll({ order: [["createdAt", "DESC"]] });
    res.json(messages);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch messages", error: error.message });
  }
});

app.get("/raw/threads", authenticateToken, async (req, res) => {
  try {
    const threads = await Threads.findAll({ include: [Profiles] });
    res.json(threads);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch threads", error: error.message });
  }
});

app.get("/raw/threads/:threadId", authenticateToken, async (req, res) => {
  try {
    const thread = await Threads.findAll({ where: { id: req.params.threadId }, include: [Profiles] });
    res.json(thread);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to fetch thread", error: error.message });
  }
});

app.get("/sanitize/:number", (req, res) => {
  try {
    const sanitized = req.params.number.split(";").pop();
    res.json(sanitized);
  } catch (error) {
    res.status(500).send({ success: false, message: "Sanitization failed", error: error.message });
  }
});

app.all("/logs", (req, res) => {
  console.log(req);
  res.status(200).send({ success: true, message: "Log received", data: req.params });
});

app.get("/dev", async (req, res) => {
  try {
    const numbers = await telnyx.phoneNumbers.list();
    res.json({ numbers });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to list numbers", error: error.message });
  }
});

app.get("/domain-check", authenticateToken, async (req, res) => {
  res.render("domain-check");
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
