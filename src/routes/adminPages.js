const express = require('express');
const path = require('path');
const { adminFromRequest } = require('../utils/security');

const router = express.Router();
const adminDir = path.join(__dirname, '../../admin');

function protectedPage(file) {
  return (req, res) => {
    if (!adminFromRequest(req)) return res.redirect('/admin');
    res.sendFile(path.join(adminDir, file));
  };
}

router.get('/', (req, res) => {
  if (adminFromRequest(req)) return res.redirect('/admin/dashboard');
  res.sendFile(path.join(adminDir, 'login.html'));
});

router.get('/login', (req, res) => {
  if (adminFromRequest(req)) return res.redirect('/admin/dashboard');
  res.sendFile(path.join(adminDir, 'login.html'));
});

router.get('/dashboard', protectedPage('dashboard.html'));
router.get('/giveaway', protectedPage('giveaway.html'));
router.get('/fields', protectedPage('fields.html'));
router.get('/submissions', protectedPage('submissions.html'));
router.get('/winner', protectedPage('winner.html'));

router.use('/css', express.static(path.join(adminDir, 'css')));
router.use('/js', express.static(path.join(adminDir, 'js')));

module.exports = router;
