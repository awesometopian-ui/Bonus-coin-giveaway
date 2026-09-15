require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

// Render and most hosting platforms sit behind a proxy.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Security
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);


// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Static files
app.use(express.static(path.join(__dirname, 'public')));


// Environment
const isProduction =
  process.env.NODE_ENV === 'production';


// Session secret warning
if (!process.env.SESSION_SECRET) {
  console.warn(
    'WARNING: SESSION_SECRET is not set. Set it in your environment before deploying.'
  );
}


// Sessions
app.use(
  session({
    name: 'bcg.sid',

    secret:
      process.env.SESSION_SECRET ||
      'dev-only-insecure-secret-change-me',

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);


// Flash messages
app.use(flash());


// Make flash messages available to all views
app.use((req, res, next) => {
  res.locals.successMessages =
    req.flash('success');

  res.locals.errorMessages =
    req.flash('error');

  next();
});


// Public routes
app.use('/', publicRoutes);


// Admin routes
app.use('/admin', adminRoutes);


// 404
app.use((req, res) => {
  res.status(404).render('404', {
    path: req.path,
  });
});


// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);

  res
    .status(500)
    .send('Something went wrong. Please try again.');
});


// Server
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Bonus Coin Giveaway server running on port ${PORT}`
  );
});
