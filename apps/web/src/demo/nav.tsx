export function demoNavLinks(base: string) {
  return [
    {
      href: `${base}/tickets`,
      label: "Tickets",
      icon: (
        <>
          <path d="M3 6.5a1.5 1.5 0 011.5-1.5h11A1.5 1.5 0 0117 6.5V8a2 2 0 000 4v1.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 13.5V12a2 2 0 000-4z" />
          <path d="M12 5v10" strokeDasharray="1.5 2" />
        </>
      ),
    },
  ];
}
