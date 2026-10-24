import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { router as guildRouter } from './routes/guilds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();

app.set('trust proxy', 1);

passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((obj: any, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  callbackURL: process.env.CALLBACK_URL!,
  scope: ['identify', 'guilds'],
}, (_accessToken, _refreshToken, profile, done) => done(null, profile)));

console.log('🔗 CALLBACK_URL =', process.env.CALLBACK_URL);
console.log('🔗 CLIENT_ID =', process.env.CLIENT_ID);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/uploads', express.static(path.resolve(__dirname, '../../../uploads')));
app.use('/static', express.static(path.join(__dirname, 'public')));

function ensureAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/discord');
}

app.get('/', (req: any, res) => {
  if (req.isAuthenticated()) return res.redirect('/guilds');
  res.render('index');
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (_req, res) => res.redirect('/guilds')
);

app.get('/logout', (req: any, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

app.use('/guilds', ensureAuth, guildRouter);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`🌐 Dashboard en http://localhost:${PORT}`));