import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const stored = browser ? localStorage.getItem('theme') : null;

export const theme = writable<'dark' | 'light'>(stored === 'light' ? 'light' : 'dark');

theme.subscribe((value) => {
  if (browser) {
    localStorage.setItem('theme', value);
    document.documentElement.setAttribute('data-theme', value);
    if (value === 'light') {
      document.body.classList.add('theme-light');
      document.body.classList.remove('theme-dark');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
    }
  }
});