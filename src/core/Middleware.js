export class MiddlewareChain {
  constructor() { this._stack = []; }
  use(fn) { this._stack.push(fn); return this; }
  async run(ctx) {
    let i = -1;
    const d = async n => {
      if (n <= i) throw new Error('next() twice');
      i = n;
      const mw = this._stack[n];
      if (!mw) return true;
      let p = false;
      await mw(ctx, () => { p = true; return d(n + 1); });
      return p || n === this._stack.length - 1;
    };
    return d(0);
  }
  get stack() { return this._stack.slice(); }
}
