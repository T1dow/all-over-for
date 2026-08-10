/**
 * src/routes/home.js
 * Public landing page (Stage 1). From Stage 3 onwards, unauthenticated
 * visitors are redirected to /login and the landing page becomes the
 * role-aware dashboard.
 */
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { getSetting } = require('../utils/settings');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  // Signed-in users go straight to their dashboard.
  if (req.session.user) return res.redirect('/dashboard');

  const schoolName = await getSetting('school.name') || 'Kay-Billie-Klaer International School';
  res.render('pages/home', {
    schoolName,
    dbConnected: true,
  });
}));

module.exports = router;
