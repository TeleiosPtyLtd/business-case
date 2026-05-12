// Icon set — minimal stroked icons + the CBAgent mark
const Icon = ({ d, size = 16, stroke = 1.6, fill = "none", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

const IconCube     = (p) => <Icon {...p} d={<><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M3 7l9 5 9-5"/><path d="M12 22V12"/></>} />;
const IconDollar   = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.7-1-2-1.5-3-1.5-1.5 0-3 .8-3 2.2 0 1.4 1.4 1.9 3 2.3 1.6.4 3 .9 3 2.3 0 1.4-1.5 2.2-3 2.2-1.5 0-2.7-.6-3.3-1.6"/><path d="M12 6.5v11"/></>} />;
const IconPercent  = (p) => <Icon {...p} d={<><path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></>} />;
const IconTrend    = (p) => <Icon {...p} d="M3 17l6-6 4 4 8-9 M14 6h7v7" />;
const IconBolt     = (p) => <Icon {...p} d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />;
const IconLeaf     = (p) => <Icon {...p} d={<><path d="M20 4c0 8-6 14-14 16M20 4c-8 0-14 6-16 14"/><path d="M5 19c2-2 4-4 7-5"/></>} />;
const IconUsers    = (p) => <Icon {...p} d={<><circle cx="9" cy="9" r="3.5"/><path d="M2 20c.5-3.5 3.5-6 7-6s6.5 2.5 7 6"/><circle cx="17" cy="7" r="2.5"/><path d="M22 17c-.3-2-2-3.5-4-3.8"/></>} />;
const IconBuilding = (p) => <Icon {...p} d={<><path d="M4 22V4h12v18M16 9h4v13"/><path d="M8 8h2M8 12h2M8 16h2M12 8h0M12 12h0M12 16h0M19 13h0M19 17h0"/></>} />;
const IconGlobe    = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>} />;
const IconCheck    = (p) => <Icon {...p} d="M4 12.5 9 17l11-11" />;
const IconCheckCircle = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M8 12.5 11 15.5l5.5-6"/></>} />;
const IconArrowRight = (p) => <Icon {...p} d="M5 12h14M13 5l7 7-7 7" />;
const IconArrowLeft  = (p) => <Icon {...p} d="M19 12H5M11 19l-7-7 7-7" />;
const IconHelp     = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5c0 2-2.5 2-2.5 4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></>} />;
const IconChevDown = (p) => <Icon {...p} d="M6 9l6 6 6-6" />;
const IconChevUp   = (p) => <Icon {...p} d="M6 15l6-6 6 6" />;
const IconPlus     = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;
const IconDots     = (p) => <Icon {...p} d={<><circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></>} />;
const IconSparkle  = (p) => <Icon {...p} d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />;
const IconTag      = (p) => <Icon {...p} d={<><path d="M3 13V4h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.4"/></>} />;
const IconSun      = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></>} />;
const IconMoon     = (p) => <Icon {...p} d="M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />;
const IconShield   = (p) => <Icon {...p} d={<><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9.5 4.5-1 8-4.5 8-9.5V6l-8-3z"/><path d="M9 12l2 2 4-4"/></>} />;
const IconClock    = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />;
const IconBookmark = (p) => <Icon {...p} d="M6 3h12v18l-6-4-6 4V3z" />;
const IconDownload = (p) => <Icon {...p} d={<><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></>} />;

// Teleios mark — verbatim path from teleios.au (the inline SVG used in the
// site's nav). The outer shape extends past a normal circle on the right
// edge (subtle swoosh + indent — the distinctive feature), so it needs to
// be rendered large enough for that detail to be visible. Uses
// `currentColor` so the mark adapts to light / dark themes via the wrapper.
const Logo = ({ size = 28 }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--ink)" }}>
    <svg width={size} height={size} viewBox="0 0 500 500" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: "block" }}>
      <path fillRule="evenodd" clipRule="evenodd"
            d="M250 90.4999C166.881 90.4999 99.5 157.881 99.5 241C99.5 324.119 166.881 391.5 250 391.5C333.119 391.5 400.5 324.119 400.5 241C400.5 157.881 333.119 90.4999 250 90.4999ZM84.5 241C84.5 149.597 158.597 75.4999 250 75.4999C297.369 75.4999 351.533 88.3274 400.5 165C438.5 224.5 433.029 231.5 432.5 233C431.971 234.5 431.5 237 423 241C419.5 242.647 414 242.5 413.5 242.5C248 242.5 341.403 406.5 250 406.5C158.597 406.5 84.5 332.403 84.5 241Z"
            fill="currentColor"/>
      <path d="M267.337 157.266V335H230.838V157.266H267.337ZM322.024 157.266V185.952H177.005V157.266H322.024Z"
            fill="currentColor"/>
    </svg>
    <span style={{
      fontFamily: "var(--sans)", fontWeight: 600, fontSize: 17,
      letterSpacing: "-0.01em", color: "var(--ink)"
    }}>Teleios</span>
  </span>
);

Object.assign(window, {
  Icon,
  IconCube, IconDollar, IconPercent, IconTrend, IconBolt, IconLeaf, IconUsers,
  IconBuilding, IconGlobe, IconCheck, IconCheckCircle, IconArrowRight, IconArrowLeft,
  IconHelp, IconChevDown, IconChevUp, IconPlus, IconDots, IconSparkle, IconTag,
  IconSun, IconMoon, IconShield, IconClock, IconBookmark, Logo,
});
