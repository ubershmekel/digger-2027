// Nobbins and Hobbins: spawning, chase AI, transformation and death.
// Ported from Monster.js.
import type { Game } from './game';
import { reversedir } from './digger';

export class MonsterData {
  x = 0;
  y = 0;
  h = 0;
  v = 0;
  xr = 0;
  yr = 0;
  dir = 0;
  hdir = 0;
  t = 0;
  hnt = 0;
  death = 0;
  bag = 0;
  dtime = 0;
  stime = 0;
  flag = false;
  nob = false;
  alive = false;
}

export type KillCause = 'shot' | 'eaten' | 'squashed' | 'grave';

export class Monster {
  mondat = [0, 1, 2, 3, 4, 5].map(() => new MonsterData());
  nextmonster = 0;
  totalmonsters = 0;
  maxmononscr = 0;
  nextmontime = 0;
  mongaptime = 0;
  unbonusflag = false;
  mongotgold = false;

  constructor(private readonly g: Game) {}

  checkcoincide(mon: number, bits: number): void {
    const md = this.mondat;
    for (let m = 0, b = 256; m < 6; m++, b <<= 1)
      if ((bits & b) != 0 && md[mon].dir == md[m].dir && md[m].stime == 0 && md[mon].stime == 0)
        md[m].dir = reversedir(md[m].dir);
  }

  checkmonscared(h: number): void {
    for (let m = 0; m < 6; m++) if (h == this.mondat[m].h && this.mondat[m].dir == 2) this.mondat[m].dir = 6;
  }

  createmonster(): void {
    for (let i = 0; i < 6; i++) {
      const m = this.mondat[i];
      if (!m.flag) {
        m.flag = true;
        m.alive = true;
        m.t = 0;
        m.nob = true;
        m.hnt = 0;
        m.h = 14;
        m.v = 0;
        m.x = 292;
        m.y = 18;
        m.xr = 0;
        m.yr = 0;
        m.dir = 4;
        m.hdir = 4;
        this.nextmonster++;
        this.nextmontime = this.mongaptime;
        m.stime = 5;
        this.g.sprite.movedrawspr(i + 8, m.x, m.y);
        this.g.emit({ type: 'monsterSpawn', mon: i });
        break;
      }
    }
  }

  domonsters(): void {
    const { g } = this;
    if (this.nextmontime > 0) this.nextmontime--;
    else {
      if (this.nextmonster < this.totalmonsters && this.nmononscr() < this.maxmononscr && g.digger.digonscr && !g.digger.bonusmode)
        this.createmonster();
      if (this.unbonusflag && this.nextmonster == this.totalmonsters && this.nextmontime == 0)
        if (g.digger.digonscr) {
          this.unbonusflag = false;
          g.digger.createbonus();
        }
    }
    for (let i = 0; i < 6; i++) {
      const m = this.mondat[i];
      if (m.flag) {
        if (m.hnt > 10 - g.main.levof10()) {
          if (m.nob) {
            m.nob = false;
            m.hnt = 0;
          }
        }
        if (m.alive)
          if (m.t == 0) {
            this.monai(i);
            if (g.main.randno(15 - g.main.levof10()) == 0 && m.nob) this.monai(i);
          } else m.t--;
        else this.mondie(i);
      }
    }
  }

  erasemonsters(): void {
    for (let i = 0; i < 6; i++) if (this.mondat[i].flag) this.g.sprite.erasespr(i + 8);
  }

  fieldclear(dir: number, x: number, y: number): boolean {
    const gf = (a: number, b: number) => this.getfield(a, b);
    switch (dir) {
      case 0:
        if (x < 14) if ((gf(x + 1, y) & 0x2000) == 0) if ((gf(x + 1, y) & 1) == 0 || (gf(x, y) & 0x10) == 0) return true;
        break;
      case 4:
        if (x > 0) if ((gf(x - 1, y) & 0x2000) == 0) if ((gf(x - 1, y) & 0x10) == 0 || (gf(x, y) & 1) == 0) return true;
        break;
      case 2:
        if (y > 0) if ((gf(x, y - 1) & 0x2000) == 0) if ((gf(x, y - 1) & 0x800) == 0 || (gf(x, y) & 0x40) == 0) return true;
        break;
      case 6:
        if (y < 9) if ((gf(x, y + 1) & 0x2000) == 0) if ((gf(x, y + 1) & 0x40) == 0 || (gf(x, y) & 0x800) == 0) return true;
    }
    return false;
  }

  getfield(x: number, y: number): number {
    return this.g.drawing.field[y * 15 + x];
  }

  incmont(n: number): void {
    if (n > 6) n = 6;
    for (let m = 1; m < n; m++) this.mondat[m].t++;
  }

  incpenalties(bits: number): void {
    for (let m = 0, b = 256; m < 6; m++, b <<= 1) {
      if ((bits & b) != 0) this.g.main.incpenalty();
      b <<= 1;
    }
  }

  initmonsters(): void {
    const lev = this.g.main.levof10();
    for (let i = 0; i < 6; i++) this.mondat[i].flag = false;
    this.nextmonster = 0;
    this.mongaptime = 45 - (lev << 1);
    this.totalmonsters = lev + 5;
    switch (lev) {
      case 1:
        this.maxmononscr = 3;
        break;
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        this.maxmononscr = 4;
        break;
      case 8:
      case 9:
      case 10:
        this.maxmononscr = 5;
    }
    this.nextmontime = 10;
    this.unbonusflag = true;
  }

  killmon(mon: number, cause: KillCause = 'shot'): void {
    const m = this.mondat[mon];
    if (m.flag) {
      this.g.emit({ type: 'monsterKilled', mon, x: m.x, y: m.y, nob: m.nob, cause });
      m.flag = m.alive = false;
      this.g.sprite.erasespr(mon + 8);
      if (this.g.digger.bonusmode) this.totalmonsters++;
    }
  }

  killmonsters(bits: number, cause: KillCause = 'grave'): number {
    let n = 0;
    for (let m = 0, b = 256; m < 6; m++, b <<= 1)
      if ((bits & b) != 0) {
        this.killmon(m, cause);
        n++;
      }
    return n;
  }

  monai(mon: number): void {
    const { g } = this;
    const m = this.mondat[mon];
    const lev = g.main.levof10();
    let mdirp1 = 0;
    let mdirp2 = 0;
    let mdirp3 = 0;
    let mdirp4 = 0;
    let t: number;
    let dir: number;
    const monox = m.x;
    const monoy = m.y;
    if (m.xr == 0 && m.yr == 0) {
      /* Turn hobbin back into nobbin if it's had its time */
      if (m.hnt > 30 + (lev << 1))
        if (!m.nob) {
          m.hnt = 0;
          m.nob = true;
        }

      /* Set up monster direction properties to chase dig */
      const dx = g.digger.diggerx;
      const dy = g.digger.diggery;
      if (Math.abs(dy - m.y) > Math.abs(dx - m.x)) {
        if (dy < m.y) {
          mdirp1 = 2;
          mdirp4 = 6;
        } else {
          mdirp1 = 6;
          mdirp4 = 2;
        }
        if (dx < m.x) {
          mdirp2 = 4;
          mdirp3 = 0;
        } else {
          mdirp2 = 0;
          mdirp3 = 4;
        }
      } else {
        if (dx < m.x) {
          mdirp1 = 4;
          mdirp4 = 0;
        } else {
          mdirp1 = 0;
          mdirp4 = 4;
        }
        if (dy < m.y) {
          mdirp2 = 2;
          mdirp3 = 6;
        } else {
          mdirp2 = 6;
          mdirp3 = 2;
        }
      }

      /* In bonus mode, run away from digger */
      if (g.digger.bonusmode) {
        t = mdirp1;
        mdirp1 = mdirp4;
        mdirp4 = t;
        t = mdirp2;
        mdirp2 = mdirp3;
        mdirp3 = t;
      }

      /* Adjust priorities so that monsters don't reverse direction unless they really have to */
      dir = reversedir(m.dir);
      if (dir == mdirp1) {
        mdirp1 = mdirp2;
        mdirp2 = mdirp3;
        mdirp3 = mdirp4;
        mdirp4 = dir;
      }
      if (dir == mdirp2) {
        mdirp2 = mdirp3;
        mdirp3 = mdirp4;
        mdirp4 = dir;
      }
      if (dir == mdirp3) {
        mdirp3 = mdirp4;
        mdirp4 = dir;
      }

      /* Introduce a random element on levels <6 : occasionally swap p1 and p3 */
      if (g.main.randno(lev + 5) == 1 && lev < 6) {
        t = mdirp1;
        mdirp1 = mdirp3;
        mdirp3 = t;
      }

      /* Check field and find direction */
      if (this.fieldclear(mdirp1, m.h, m.v)) dir = mdirp1;
      else if (this.fieldclear(mdirp2, m.h, m.v)) dir = mdirp2;
      else if (this.fieldclear(mdirp3, m.h, m.v)) dir = mdirp3;
      else if (this.fieldclear(mdirp4, m.h, m.v)) dir = mdirp4;

      /* Hobbins don't care about the field: they go where they want. */
      if (!m.nob) dir = mdirp1;

      /* Monsters take a time penalty for changing direction */
      if (m.dir != dir) m.t++;

      m.dir = dir;
    }

    /* If monster is about to go off edge of screen, stop it. */
    if ((m.x == 292 && m.dir == 0) || (m.x == 12 && m.dir == 4) || (m.y == 180 && m.dir == 6) || (m.y == 18 && m.dir == 2))
      m.dir = -1;

    /* Change hdir for hobbin */
    if (m.dir == 4 || m.dir == 0) m.hdir = m.dir;

    /* Hobbins dig */
    if (!m.nob) g.drawing.eatfield(m.x, m.y, m.dir);

    /* (Draw new tunnels) and move monster */
    switch (m.dir) {
      case 0:
        if (!m.nob) g.drawing.drawrightblob(m.x, m.y);
        m.x += 4;
        break;
      case 4:
        if (!m.nob) g.drawing.drawleftblob(m.x, m.y);
        m.x -= 4;
        break;
      case 2:
        if (!m.nob) g.drawing.drawtopblob(m.x, m.y);
        m.y -= 3;
        break;
      case 6:
        if (!m.nob) g.drawing.drawbottomblob(m.x, m.y);
        m.y += 3;
        break;
    }

    /* Hobbins can eat emeralds */
    if (!m.nob) g.digger.hitemerald(Math.floor((m.x - 12) / 20), Math.floor((m.y - 18) / 18), (m.x - 12) % 20, (m.y - 18) % 18, m.dir);

    /* If digger's gone, don't bother */
    if (!g.digger.digonscr) {
      m.x = monox;
      m.y = monoy;
    }

    /* If monster's just started, don't move yet */
    if (m.stime != 0) {
      m.stime--;
      m.x = monox;
      m.y = monoy;
    }

    /* Increase time counter for hobbin */
    if (!m.nob && m.hnt < 100) m.hnt++;

    /* Draw monster */
    let push = true;
    const clbits = g.drawing.drawmon(mon, m.nob, m.hdir, m.x, m.y);
    g.main.incpenalty();

    /* Collision with another monster */
    if ((clbits & 0x3f00) != 0) {
      m.t++;
      this.checkcoincide(mon, clbits);
      this.incpenalties(clbits);
    }

    /* Check for collision with bag */
    if ((clbits & g.bags.bagbits()) != 0) {
      m.t++;
      this.mongotgold = false;
      if (m.dir == 4 || m.dir == 0) {
        push = g.bags.pushbags(m.dir, clbits);
        m.t++;
      } else if (!g.bags.pushudbags(clbits)) push = false;
      if (this.mongotgold) m.t = 0;
      if (!m.nob && m.hnt > 1) g.bags.removebags(clbits); /* Hobbins eat bags */
    }

    /* Increase hobbin cross counter */
    if (m.nob && (clbits & 0x3f00) != 0 && g.digger.digonscr) m.hnt++;

    /* See if bags push monster back */
    if (!push) {
      m.x = monox;
      m.y = monoy;
      g.drawing.drawmon(mon, m.nob, m.hdir, m.x, m.y);
      g.main.incpenalty();
      if (m.nob) m.hnt++; /* The other way to create hobbin: stuck on h-bag */
      if ((m.dir == 2 || m.dir == 6) && m.nob) m.dir = reversedir(m.dir);
    }

    /* Collision with digger */
    if ((clbits & 1) != 0 && g.digger.digonscr)
      if (g.digger.bonusmode) {
        this.killmon(mon, 'eaten');
        g.scores.scoreeatm();
        g.sound.soundeatm();
      } else g.digger.killdigger(3, 0);

    m.h = Math.floor((m.x - 12) / 20);
    m.v = Math.floor((m.y - 18) / 18);
    m.xr = (m.x - 12) % 20;
    m.yr = (m.y - 18) % 18;
  }

  mondie(mon: number): void {
    const m = this.mondat[mon];
    const { g } = this;
    switch (m.death) {
      case 1:
        if (g.bags.bagy(m.bag) + 6 > m.y) m.y = g.bags.bagy(m.bag);
        g.drawing.drawmondie(mon, m.nob, m.hdir, m.x, m.y);
        g.main.incpenalty();
        if (g.bags.getbagdir(m.bag) == -1) {
          m.dtime = 1;
          m.death = 4;
        }
        break;
      case 4:
        if (m.dtime != 0) m.dtime--;
        else {
          this.killmon(mon, 'squashed');
          g.scores.scorekill();
        }
    }
  }

  mongold(): void {
    this.mongotgold = true;
  }

  monleft(): number {
    return this.nmononscr() + this.totalmonsters - this.nextmonster;
  }

  nmononscr(): number {
    let n = 0;
    for (let i = 0; i < 6; i++) if (this.mondat[i].flag) n++;
    return n;
  }

  squashmonster(mon: number, death: number, bag: number): void {
    const m = this.mondat[mon];
    m.alive = false;
    m.death = death;
    m.bag = bag;
  }

  squashmonsters(bag: number, bits: number): void {
    for (let m = 0, b = 256; m < 6; m++, b <<= 1)
      if ((bits & b) != 0) if (this.mondat[m].y >= this.g.bags.bagy(bag)) this.squashmonster(m, 1, bag);
  }
}
