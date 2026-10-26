"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_ENV_ID = void 0;
/**
 * 云端开关：填入微信云开发环境 ID 后启用《PRD 登录鉴权与学员库管理》云端模式
 * （OpenID 静默登录 / 学员总表 / 教师学员库 / 管理员后台，见 docs/云开发部署指南.md）。
 *
 * 留空 = 维持旧的「离线激活码」纯客户端模式，现有功能完全不受影响。
 * 部署完云函数并开通环境后，只需在此填入环境 ID（形如 cloud1-2g5abc123）。
 */
exports.CLOUD_ENV_ID = "";
