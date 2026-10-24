export function LeaderboardScenery() {
  return <div className="valley-scenery" aria-hidden="true"><svg viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="valley-sky" x2="0" y2="1"><stop stopColor="#fbfcff"/><stop offset=".6" stopColor="#edf5f3"/><stop offset="1" stopColor="#f8eee5"/></linearGradient><linearGradient id="valley-sun"><stop stopColor="#fff7dd"/><stop offset="1" stopColor="#f2d8c1"/></linearGradient></defs>
    <path fill="url(#valley-sky)" d="M0 0h1200v1000H0z"/>
    <circle cx="875" cy="235" r="110" fill="url(#valley-sun)" opacity=".75"/>
    <g opacity=".5"><path d="m0 660 260-315 280 315Z" fill="#d7e8e3"/><path d="m260 345 280 315H370Z" fill="#c7dad7"/><path d="m720 680 250-280 230 280Z" fill="#e5dfeb"/><path d="m970 400 230 280h-85Z" fill="#d0d4e4"/></g>
    <path d="m-100 890 380-230 430 240-400 240Z" fill="#d9e9e2"/><path d="m280 660 430 240v65L280 725Z" fill="#bdd5cf"/>
    <path d="m815 715 290-165 250 145-290 170Z" fill="#eadfee"/><path d="m815 715 250 150v60L815 776Z" fill="#c6bdd8"/><path d="m1065 865 290-170v60l-290 170Z" fill="#d5cce2"/>
    <g className="valley-architecture"><path d="m145 545 135-77 135 77-135 78Z" fill="#fffefa"/><path d="m145 545 135 78v190l-135-78Z" fill="#e7e1d5"/><path d="m280 623 135-78v190l-135 78Z" fill="#d6dbd6"/>
      <path d="M194 574v95l29 17v-77q0-21 18-11v99l23 13V615Z" fill="#a9bfc0"/>
      <path d="m216 500 65-38 66 38-66 38Z" fill="#f9f5ea"/><path d="m216 500 65 38V353l-65-38Z" fill="#e9e4d7"/><path d="m281 538 66-38V315l-66 38Z" fill="#d6dfd8"/>
      <path d="m210 315 71-42 72 42-72 42Z" fill="#fffef8"/><path d="m281 236-71 79 71-41 72 41Z" fill="#d4bcce"/>
    </g>
    <g transform="translate(930 470)"><path d="m-95 20 95-55 95 55L0 75Z" fill="#fffefa"/><path d="M-95 20 0 75v125l-95-55Z" fill="#e8e2d8"/><path d="M0 75 95 20v125L0 200Z" fill="#cbdad4"/><path d="M30 125V72q20-30 39-16v47Z" fill="#9db4b2"/><path d="m-48-8 48-28 48 28L0 20Z" fill="#f8fbf7"/>
      <path d="m-48-8 48 28v-145l-48-28Z" fill="#ede8dd"/><path d="m0 20 48-28v-145L0-125Z" fill="#d6e0d9"/><path d="m0-185-55 32 55 31 55-31Z" fill="#f9f5ed"/>
    </g>
    <g>{Array.from({length:9},(_,i)=><g key={i} transform={`translate(${330+i*24} ${760-i*14})`}><path d="m0 0 100-58 24 14-100 58Z" fill="#fffdf7"/><path d="m0 0 24 14v14L0 14Z" fill="#d3dcd3"/><path d="m24 14 100-58v14L24 28Z" fill="#c4d3cc"/></g>)}</g>
    <g fill="#8ab5aa" opacity=".7"><path d="M82 683v78l-23-13v-78Z"/><path d="m81 658 24 40-24 14-24-14Z"/><path d="M1095 650v75l-18-10v-75Z"/><path d="m1094 624 22 38-22 13-22-13Z"/></g>
    <path d="M0 930q300-65 600 30t600-10v50H0Z" fill="#fbfdfc" opacity=".9"/>
  </svg></div>;
}
