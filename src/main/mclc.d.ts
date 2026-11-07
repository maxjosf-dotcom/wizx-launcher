declare module 'minecraft-launcher-core' {
  export class Client {
    launch(options: any): Promise<any>;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
