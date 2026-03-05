const form = document.getElementById('proxy-form');
const input = document.getElementById('url-input');
const frame = document.getElementById('proxy-frame');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const value = input.value.trim();
  if (!value) return;

  frame.src = `/proxy?url=${encodeURIComponent(value)}`;
});
