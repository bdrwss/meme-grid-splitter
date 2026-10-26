/**
 * 最小运行时声明（零依赖，不安装 miniprogram-api-typings）。
 * 后续如需完整类型可 npm i -D miniprogram-api-typings 替换本文件。
 */
declare function App(options: any): void;
declare function Page(options: any): void;
declare function Component(options: any): void;
declare function getApp(): any;
declare function getCurrentPages(): any[];
declare const wx: any;
declare const console: any;

// 小程序运行时提供的全局函数/能力
declare function setTimeout(callback: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(handle?: number): void;
declare function setInterval(callback: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(handle?: number): void;
declare function require(path: string): any;

// Canvas 相关（2d 接口，具体 API 以运行时为准，宽松处理）
declare type CanvasRenderingContext2D = any;
declare type ImageData = any;
