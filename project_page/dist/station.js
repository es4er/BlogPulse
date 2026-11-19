const labels = ['Lilian Weng', '科学空间', 'Anthropic', 'OpenAI', 'Cursor', 'Latent Space', 'Hacker News', 'TML', 'LangChain', 'LMSYS'];
examples.forEach(([id, name], index) => {
  const button = document.createElement('button');
  button.dataset.id = id;
  button.title = name;
  const channel = document.createElement('small');
  channel.textContent = 'CH ' + String(index + 1).padStart(2, '0');
  button.append(channel, labels[index]);
  document.querySelector('#channels').append(button);
});
const meter = document.querySelector('.meters');
const heights = [8, 14, 19, 11, 22, 28, 18, 12, 24, 30, 17, 9, 15, 21, 10];
const bars = heights.map(() => meter.appendChild(document.createElement('i')));
function tune(index) {
  document.querySelectorAll('#channels button').forEach((button, position) => button.setAttribute('aria-pressed', String(index === position)));
  document.querySelector('#number').textContent = String(index + 1).padStart(2, '0');
  document.querySelector('#tuned').textContent = examples[index][1];
  document.querySelector('.screen img').style.filter = 'hue-rotate(' + [0, 14, -16, 32, -24, 10, -30, 24, 44, -12][index] + 'deg)';
  bars.forEach((bar, position) => bar.style.height = heights[(position + index * 3) % bars.length] + 'px');
}
document.querySelectorAll('#channels button').forEach((button, index) => button.onclick = () => tune(index));
tune(0);
const commands = document.querySelector('#commands');
const feedback = document.querySelector('#copy-state');
document.querySelectorAll('[data-py]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-py]').forEach(other => other.setAttribute('aria-pressed', String(button === other)));
  commands.textContent = ['-m pip install -r requirements.txt', 'blogpulse.py once', 'blogpulse.py web'].map(line => button.dataset.py + ' ' + line).join('\n');
  feedback.textContent = '';
});
document.querySelector('#copy').onclick = async () => {
  try { await navigator.clipboard.writeText(commands.textContent); feedback.textContent = '命令已复制'; }
  catch { feedback.textContent = '请选中命令后手动复制'; }
};
