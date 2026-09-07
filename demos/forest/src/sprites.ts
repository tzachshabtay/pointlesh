import type Phaser from 'phaser';

// Small deterministic pixel actors keep frame baselines exact for movement-linked animation.
const pattern = [
'........................','........................','.........hhhhhh.........','.......hhhhhhhhhh.......','......hhhhHHhhhhhh......','......hhhhhhhhhhhh......','.....hhhhhhhhhhhhhh.....','.......sssssSSsss.......','......sswksSSwksSs......','......sssssssSSsss......','.......bbbbSbbbb........','......bbbbBBBBbbb.......','.....bbbbBBBBBBbbb......','.....bbbBBBBBBBBbb......','......bbbBBBBBBbb.......','.....ttbbBBBBbbttt......','....ttttbbbbbbttttt.....','...sstttttttttttttss....','...sstttTttttTttttss....','...sstttttttttttttss....','....sttttttttttttts.....','.....ttttttttttttt......','......lllyyyy lll.......'.replace(' ', 'l'),'......lllllllllll.......','......llll...llll.......','......llll...llll.......','......llll...llll.......','.....kkkkk...kkkkk......','....kkkkkk...kkkkkk.....','........................','........................','........................'];
export function createPixelActors(scene: Phaser.Scene): void {
  const palettes: Record<string, Record<string, string>> = {
    borin: { h:'#a4452d',H:'#cc7650',s:'#dcaa7a',S:'#f3c797',w:'#f6e7bd',k:'#302b27',b:'#b58348',B:'#e4bf77',t:'#47736a',T:'#709b84',l:'#494836',y:'#cba559' },
    elder: { h:'#596856',H:'#899877',s:'#cfa47a',S:'#eac79b',w:'#fff6d8',k:'#312d29',b:'#aaa99a',B:'#e3deba',t:'#6c6856',T:'#91906b',l:'#434734',y:'#cba559' },
    innkeeper: { h:'#934b2c',H:'#ba7840',s:'#dca170',S:'#f1c697',w:'#fff0cf',k:'#3a2722',b:'#934b2c',B:'#b56d37',t:'#b0804e',T:'#ddc98e',l:'#635244',y:'#cab36d' },
    miner: { h:'#847052',H:'#cba758',s:'#cca072',S:'#e4bd90',w:'#fff2c8',k:'#292a26',b:'#675040',B:'#a28157',t:'#73634b',T:'#97886b',l:'#414944',y:'#ccae64' },
    guard: { h:'#465d34',H:'#667b40',s:'#809357',S:'#a0b96e',w:'#f0df96',k:'#282f21',b:'#657744',B:'#96a75b',t:'#6f4c36',T:'#916344',l:'#454435',y:'#b8a56a' },
    king: { h:'#cda64c',H:'#f0d171',s:'#d9b080',S:'#f0cca0',w:'#fff3c8',k:'#322925',b:'#aea397',B:'#e6d1ae',t:'#934745',T:'#b57055',l:'#61534c',y:'#ddbd69' }
  };
  for (const [name, palette] of Object.entries(palettes)) {
    const texture = scene.textures.createCanvas(`actor.${name}`, 24 * 8, 32)!;
    const context = texture.context;
    for (let frame = 0; frame < 8; frame++) {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) {
        const letter = pattern[y]?.[x];
        if (!letter || letter === '.' || !palette[letter]) continue;
        let dx = 0, dy = 0;
        if (frame < 4 && y >= 24) { dx = x < 12 ? (frame === 1 ? -1 : frame === 3 ? 1 : 0) : (frame === 1 ? 1 : frame === 3 ? -1 : 0); dy = (frame === 1 && x < 12 || frame === 3 && x >= 12) ? -1 : 0; }
        if (frame < 4 && (frame === 1 || frame === 3) && y < 23) dy = -1;
        if (frame === 5 && y < 23) dy = -1;
        context.fillStyle = palette[letter]; context.fillRect(frame * 24 + x + dx, y + dy, 1, 1);
      }
      if (frame === 7) { context.fillStyle = '#412b22'; context.fillRect(frame * 24 + 10, 11, 4, 2); }
      texture.add(frame, 0, frame * 24, 0, 24, 32);
    }
    texture.refresh();
  }
  const pickupPatterns: Record<string, string[]> = {
    coin: ['................','......yyyy......','....yyYYYYyy....','...yYYyYYyYYy...','...yYYyYYyYYy...','...yYYyYYyYYy...','....yyYYYYyy....','......yyyy......','................'],
    rope: ['................','.....rrrrrr.....','...rrRRRRRRrr...','..rRRr....rRRr..','..rRr..rr..rRr..','..rRr.rRRr.rRr..','..rRRr.rr.rRRr..','...rRRrrrrRRr...','....rrRRRRrr....','......rrrr......','.......rRr......','.......rRr......','........rr......'],
    mushroom: ['................','......mmmm......','....mmMwwMmm....','...mMMwwMMMMm...','..mMwMMMMMwMMm..','..mMMMwwMMMMMm..','...mmmmmmmmmm...','......ssss......','......sSSs......','......sSSs......','.....ssSSss.....']
  };
  const colors: Record<string,string> = { y:'#99672e',Y:'#e9c765',r:'#684a2e',R:'#bd9960',m:'#66497b',M:'#b98bbc',w:'#f7e6d4',s:'#a88d70',S:'#e1cbae' };
  for (const [id, rows] of Object.entries(pickupPatterns)) {
    const texture = scene.textures.createCanvas(`pickup.${id}`,16,16)!;
    rows.forEach((row,y) => [...row].forEach((letter,x) => { if (colors[letter]) { texture.context.fillStyle = colors[letter]; texture.context.fillRect(x,y,1,1); } }));
    texture.refresh();
  }
}

export class ForestMusic {
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;
  private active = false;
  private step = 0;
  toggle(): boolean {
    if (this.active) { this.stop(); return false; }
    this.context ??= new AudioContext(); void this.context.resume(); this.active = true;
    const melody = [0, 7, 12, 14, 10, 7, 3, 7, 0, 5, 10, 12, 7, 5, 3, -2];
    const play = () => {
      if (!this.context || !this.active) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator(), gain = this.context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 196 * 2 ** (melody[this.step++ % melody.length] / 12);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.045, now + 0.06); gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      oscillator.connect(gain).connect(this.context.destination); oscillator.start(now); oscillator.stop(now + 1.4);
    };
    play(); this.timer = setInterval(play, 730); return true;
  }
  stop(): void { this.active = false; if (this.timer) clearInterval(this.timer); }
}
