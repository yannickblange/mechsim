// theme.js - light / dark colour scheme. The scheme is a data-theme attribute on <html>; the colours
// themselves are CSS variables in css/main.css. Light is the default; the choice is remembered.
const KEY = 'mechsim.theme';

export const THEMES = ['light', 'dark'];

export function storedTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light'; // storage blocked (private mode, file://)
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(name) {
  const theme = name === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // not remembered, still applied
  }
  return theme;
}

export const otherTheme = (name) => (name === 'dark' ? 'light' : 'dark');
