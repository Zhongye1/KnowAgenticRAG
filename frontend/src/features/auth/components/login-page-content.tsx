import DriftWall from '@/features/auth/components/DriftWall/DriftWall';
import AuthFormPanel from '@/features/auth/components/Form/AuthFormPanel';

/**
 * 登录卡片。
 * 默认「账号密码」Tab（当前后端唯一可用登录方式）；
 * 扫码 / QQ / 微信接口后端尚未实现，面板内展示占位。
 * 登录与注册在同一张卡片内切换。
 */

export function Loginpagecontent() {
  const items = [
    {
      image:
        'https://xerrors.oss-cn-shanghai.aliyuncs.com/github/image-20260608002434299.png',
      title: 'Peaks',
      href: 'https://example.com/one',
    },
    {
      image:
        'https://xerrors.oss-cn-shanghai.aliyuncs.com/github/image-20260605205221908.png',
      title: 'Pup',
      href: 'https://example.com/two',
    },
    {
      image: 'https://pica.zhimg.com/v2-7bbc59155421adef9344ea8319ff616c_r.jpg',
      title: 'Falls',
      href: 'https://example.com/three',
    },
    {
      image:
        'https://github.com/nageoffer/ragent/raw/main/assets/rag-misconceptions-v2.png',
      title: 'Falls',
      href: 'https://example.com/three',
    },
    {
      image:
        'https://www.runoob.com/wp-content/uploads/2025/03/mcp-runoob-12xv.jpeg',
      title: 'Falls',
      href: 'https://example.com/three',
    },
    {
      image:
        'https://pic3.zhimg.com/80/v2-8de8add37668cb28db59a368848a2992_720w.webp',
      title: 'Falls',
      href: 'https://example.com/three',
    },
    {
      image:
        'https://pic1.zhimg.com/80/v2-48bf613091109811bbe13f6da90259b6_720w.webp',
      title: 'Falls',
      href: 'https://example.com/three',
    },
  ];

  return (
    <>
      <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-color-black">
        {/* 右: 表单 */}
        <div className="flex-[4] flex items-center justify-center bg-color-bg-2">
          <div className="auth-panel p-12 flex flex-col justify-center w-full h-full bg-color-bg-1">
            <AuthFormPanel></AuthFormPanel>
          </div>
        </div>
        {/* DriftWall */}
        <div className="flex-[6] overflow-hidden relative min-w-0 bg-color-bg-1">
          <div className="absolute inset-0 ">
            <DriftWall
              items={items}
              columns={3}
              tileWidth={200}
              tileHeight={132}
              gap={28}
              tilt={26}
              turn={-10}
              perspective={1200}
              depth={120}
              speed={42}
              direction="up"
              lift={64}
              radius={14}
              dim={1}
              overlayColor="#8d878718"
            />
          </div>
        </div>
      </div>
    </>
  );
}
