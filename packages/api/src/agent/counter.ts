import { Agent, callable } from "agents";
import type { RuntimeEnv } from "../app/context";

export type CounterState = {
  count: number;
};

export class CounterAgent extends Agent<RuntimeEnv, CounterState> {
  override initialState: CounterState = { count: 0 };

  @callable()
  increment() {
    this.setState({ count: this.state.count + 1 });
    return this.state.count;
  }

  @callable()
  decrement() {
    this.setState({ count: this.state.count - 1 });
    return this.state.count;
  }

  @callable()
  reset() {
    this.setState({ count: 0 });
    return this.state.count;
  }
}
