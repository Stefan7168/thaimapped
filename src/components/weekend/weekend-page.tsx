"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarPlus, Share2 } from "lucide-react";
import type {
  Area,
  Locale,
  Pin,
  Station,
  TripRoute,
} from "@/lib/content/types";
import { t } from "@/lib/i18n/locales";
import { strings } from "@/lib/i18n/strings";
import {
  distanceM,
  isFullRange,
  PRICE_RANGE,
  WALK_PACE_M_PER_MIN,
  type PriceRange,
} from "@/lib/explorer/filters";
import {
  WEEKEND_SLOTS,
  weekendPlan,
  type WeekendSlot,
  SLOT_TIMES,
} from "@/lib/explorer/weekend";
import { whenLine } from "@/lib/explorer/when";
import { thb } from "@/lib/explorer/price";
import { buildOutboundUrl, subIdFor, type Partner } from "@/lib/links/build";
import { directionsUrl } from "@/lib/links/directions";
import { adoptStayFromUrl, nights, stayParam, useStay } from "@/lib/stay/store";
import { buildIcs, downloadIcs, type CalendarEvent } from "@/lib/stay/calendar";
import { trackOutbound } from "@/lib/links/track";
import { supports3D } from "@/lib/map/device";
import { SiteHeader } from "@/components/explorer/site-header";
import { SiteFooter } from "@/components/explorer/site-footer";
import { SaveButton } from "@/components/saved/save-button";
import { StayPicker } from "@/components/stay/stay-picker";
import { HotelCompare } from "@/components/stay/hotel-compare";
import { useSaved } from "@/lib/saved/store";
import { KIND_ICONS } from "@/components/explorer/kind-bar";

const StageMap = dynamic(
  () => import("@/components/map/stage-map").then((m) => m.StageMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-paper" />,
  },
);

const noopSubscribe = () => () => {};

/** `?price=min-max` from the address bar, clamped to the slider's range; null when absent or the full range. */
function readPrice(): PriceRange | null {
  const m = new URLSearchParams(window.location.search)
    .get("price")
    ?.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  const r = {
    min: Math.max(PRICE_RANGE.min, Number(m[1])),
    max: Math.min(PRICE_RANGE.max, Number(m[2])),
  };
  return r.min < r.max && !isFullRange(r) ? r : null;
}

/**
 * One area's weekend as a page of its own: the plan from Friday night to
 * Sunday, the hotels inside the budget, the same map at the side, and a
 * link anyone can share. The page is static; the budget rides in the URL.
 */
export function WeekendPage({
  locale,
  cityId,
  area,
  areas,
  stations,
  routes,
}: {
  locale: Locale;
  cityId: string;
  area: Area;
  areas: Area[];
  stations: Station[];
  routes: TripRoute[];
}) {
  const s = strings(locale);
  const stay = useStay();
  const detected3D = useSyncExternalStore(
    noopSubscribe,
    supports3D,
    () => null,
  );
  const [price, setPrice] = useState<PriceRange | null>(null);
  // A hotel named in the address ("?hotel=") by whoever sent the link: used as theirs for this visit, never saved.
  const [sentHotel, setSentHotel] = useState<string | null>(null);
  // With two or more hotels of this area saved, the reader can say which one the plan walks from; kept per area in this browser.
  const [chosenHotel, setChosenHotel] = useState<string | null>(null);
  const chooseHotel = (id: string) => {
    setChosenHotel(id);
    try {
      localStorage.setItem(`tm.hotel.${area.id}`, id);
    } catch {}
  };
  // The address is not known on the server; read it once the page is live.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setPrice(readPrice());
      setSentHotel(new URLSearchParams(window.location.search).get("hotel"));
      try {
        setChosenHotel(localStorage.getItem(`tm.hotel.${area.id}`));
      } catch {}
      adoptStayFromUrl();
    });
    return () => window.cancelAnimationFrame(id);
  }, [area.id]);
  const plan = useMemo(() => weekendPlan(area, price), [area, price]);
  const [card, setCard] = useState<{ pin: Pin; area: Area } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");
  const stationById = useMemo(
    () => new Map(stations.map((st) => [st.id, st])),
    [stations],
  );
  const stops = useMemo(
    () => WEEKEND_SLOTS.flatMap((slot) => plan.slots[slot]),
    [plan],
  );
  // A hotel the reader saved comes first under "Where to sleep".
  const saved = useSaved();
  const hotels = useMemo(
    () =>
      [...plan.hotels].sort(
        (a, b) => Number(saved.includes(b.id)) - Number(saved.includes(a.id)),
      ),
    [plan.hotels, saved],
  );
  const pinned = useMemo(() => [...stops, ...hotels], [stops, hotels]);
  // The hotel the reader saved (hearted) in this area: every stop then says how far it is from that door.
  const myHotel = useMemo(
    () =>
      hotels.find((h) => h.id === sentHotel) ??
      hotels.find((h) => h.id === chosenHotel && saved.includes(h.id)) ??
      hotels.find((h) => saved.includes(h.id)) ??
      null,
    [hotels, saved, sentHotel, chosenHotel],
  );
  // Stable map props: a new object on every render would rebuild the markers and re-frame the map on each hover or card change.
  const mapAreas = useMemo(() => [area], [area]);
  const focus = useMemo(
    () => ({ pins: pinned, area, numbered: true, mine: myHotel?.id }),
    [pinned, area, myHotel?.id],
  );
  const fromHotel = (pin: Pin) =>
    myHotel
      ? Math.max(
          1,
          Math.round(
            distanceM(
              myHotel.location.lon,
              myHotel.location.lat,
              pin.location.lon,
              pin.location.lat,
            ) / WALK_PACE_M_PER_MIN,
          ),
        )
      : null;
  // Stops of this weekend inside a ten-minute walk of a hotel, straight-line at walking pace.
  const nearbyCount = (hotel: Pin) =>
    stops.filter(
      (p) =>
        distanceM(
          hotel.location.lon,
          hotel.location.lat,
          p.location.lon,
          p.location.lat,
        ) <=
        WALK_PACE_M_PER_MIN * 10,
    ).length;
  // With a Friday-to-Sunday stay picked, each slot heading carries its date.
  const slotDay = (slot: WeekendSlot): Date | null => {
    if (!stay || nights(stay) !== 2) return null;
    const d = new Date(stay.checkIn + "T00:00:00");
    if (d.getDay() !== 5) return null;
    d.setDate(
      d.getDate() + (slot === "fridayNight" ? 0 : slot === "sunday" ? 2 : 1),
    );
    return d;
  };
  const slotDate = (slot: WeekendSlot): string | null => {
    const d = slotDay(slot);
    return d
      ? new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
        }).format(d)
      : null;
  };
  // The plan as a calendar file: one event per slot, Bangkok time, the stops in the description.
  const SLOT_HOURS: Record<WeekendSlot, [string, string]> = {
    fridayNight: ["18:00", "22:00"],
    saturdayMorning: ["09:00", "12:00"],
    saturdayAfternoon: ["13:00", "17:00"],
    saturdayNight: ["18:00", "22:00"],
    sunday: ["10:00", "16:00"],
  };
  const addToCalendar = () => {
    const areaName = t(area.name, locale);
    const url = window.location.href.split("#")[0];
    const hotelLine = myHotel
      ? `${s.weekendPage.calendarYourHotel}: ${t(myHotel.name, locale)}`
      : hotels.length
        ? `${s.weekendPage.calendarHotel}: ${hotels.map((h) => t(h.name, locale)).join(", ")}`
        : "";
    const events: CalendarEvent[] = WEEKEND_SLOTS.flatMap((slot) => {
      const d = slotDay(slot);
      const items = plan.slots[slot];
      if (!d || items.length === 0) return [];
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const stopsText = items
        .map((p, i) => `${i + 1}. ${t(p.name, locale)}: ${t(p.why, locale)}`)
        .join("\n");
      return [
        {
          date,
          start: SLOT_HOURS[slot][0],
          end: SLOT_HOURS[slot][1],
          title: `${s.guide.slots[slot]}, ${areaName}`,
          description: [
            `${s.weekendPage.calendarStops}:`,
            stopsText,
            hotelLine,
            url,
          ]
            .filter(Boolean)
            .join("\n"),
          location: `${t(items[0].name, locale)}, ${areaName}`,
          url,
        },
      ];
    });
    downloadIcs(
      `weekend-${area.id}.ics`,
      buildIcs(events, s.weekendPage.calendarName(areaName)),
    );
  };
  const priceQuery = price ? `price=${price.min}-${price.max}` : "";
  const explorerHref = `/${locale}/${cityId}#area=${area.id}${priceQuery ? `&${priceQuery}` : ""}`;

  const share = async () => {
    // The link carries the budget (already in the address) and the dates, so the other person sees the same plan.
    const u = new URL(window.location.href);
    if (stay) u.searchParams.set("stay", stayParam(stay));
    else u.searchParams.delete("stay");
    if (myHotel) u.searchParams.set("hotel", myHotel.id);
    else u.searchParams.delete("hotel");
    const url = u.toString();
    const title = s.weekendPage.title(t(area.name, locale));
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared("copied");
    } catch {
      setShared("failed");
    }
    window.setTimeout(() => setShared("idle"), 2500);
  };

  const stop = (pin: Pin) => {
    const n = pinned.findIndex((p) => p.id === pin.id) + 1;
    const photo = pin.photos?.[0] ?? pin.photo;
    const KindIcon = KIND_ICONS[pin.kind];
    const walkStation = pin.walk
      ? stationById.get(pin.walk.station)
      : undefined;
    const on = card?.pin.id === pin.id;
    return (
      <li key={pin.id} className="tm-wk__item">
        {<SaveButton id={pin.id} locale={locale} className="tm-wk__save" />}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => {
            setCard(on ? null : { pin, area });
            if (!on) showMap();
          }}
          onMouseEnter={() => setHoverId(pin.id)}
          onMouseLeave={() => setHoverId(null)}
          onFocus={() => setHoverId(pin.id)}
          onBlur={() => setHoverId(null)}
          className={`tm-wk__stop${on ? " tm-wk__stop--on" : ""}${hoverId === pin.id ? " tm-wk__stop--hover" : ""}`}
        >
          {photo ? (
            <Image
              src={photo.src}
              alt=""
              width={72}
              height={72}
              sizes="72px"
              className="tm-wk__thumb"
            />
          ) : (
            <span
              aria-hidden="true"
              className="tm-wk__thumb tm-wk__thumb--empty"
            >
              <KindIcon className="size-6" />
            </span>
          )}
          <span className="tm-wk__text">
            <span className="tm-wk__kind">
              <span className="tm-wk__num">{n}</span>{" "}
              {pin.kind === "hotel" && pin.tier
                ? s.filters.tier[pin.tier]
                : s.pin[pin.kind]}
            </span>
            <span className="tm-wk__name">{t(pin.name, locale)}</span>
            <span className="tm-wk__why">{t(pin.why, locale)}</span>
            {whenLine(pin, locale) && (
              <span className="tm-wk__when">{whenLine(pin, locale)}</span>
            )}
            {pin.price && (
              <span className="tm-wk__meta">
                {s.guide.priceFrom(thb(pin.price.from, locale))}
                {pin.price.basis === "tier-estimate"
                  ? ` (${s.guide.priceEstimate})`
                  : ""}
              </span>
            )}
            {pin.price && stay && (
              <span className="tm-wk__meta tm-wk__stay">
                {s.guide.stayTotal(
                  thb(pin.price.from * nights(stay), locale),
                  nights(stay),
                )}
              </span>
            )}
            {pin.walk && walkStation && (
              <span className="tm-wk__meta">
                {s.city.walkMinutes(pin.walk.minutes)}{" "}
                {s.city.from(
                  `${walkStation.code ? walkStation.code + " " : ""}${t(walkStation.name, locale)}`,
                )}
              </span>
            )}
            {pin.kind !== "hotel" && myHotel && (
              <span className="tm-wk__meta tm-wk__from">
                {s.weekendPage.fromHotel(
                  fromHotel(pin)!,
                  t(myHotel.name, locale),
                )}
              </span>
            )}
          </span>
        </button>
        <div className="tm-wk__links">
          <a
            href={directionsUrl(pin.location.lat, pin.location.lon)}
            target="_blank"
            rel="noopener"
            className="tm-card__link tm-card__link--quiet"
          >
            {s.card.directions}
          </a>
          {pin.kind === "hotel" &&
            !sentHotel &&
            myHotel &&
            myHotel.id !== pin.id &&
            saved.includes(pin.id) && (
              <button
                type="button"
                className="tm-card__link tm-card__link--quiet"
                onClick={() => chooseHotel(pin.id)}
              >
                {s.weekendPage.useHotel}
              </button>
            )}
          {pin.kind === "hotel" &&
            (Object.keys(pin.links) as Partner[]).map((p) => {
              const subId = subIdFor(`${cityId}-${area.id}`, pin.id);
              return (
                <a
                  key={p}
                  href={buildOutboundUrl(p, pin.links[p]!, subId, stay)}
                  onClick={() => p !== "official" && trackOutbound(p, subId)}
                  target="_blank"
                  rel={p === "official" ? "noopener" : "noopener sponsored"}
                  className={
                    p === "official"
                      ? "tm-card__link tm-card__link--quiet"
                      : "tm-card__link"
                  }
                >
                  {p === "official"
                    ? s.card.official
                    : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                </a>
              );
            })}
        </div>
      </li>
    );
  };

  // On a phone the map is a sticky band above the text: a tapped stop brings it back into view.
  const showMap = () => {
    if (window.innerWidth > 1023) return;
    const stage = document.querySelector(".tm-stage");
    if (stage)
      window.scrollTo({
        top: window.scrollY + stage.getBoundingClientRect().top,
        behavior: "smooth",
      });
  };

  const others = areas.filter((a) => a.id !== area.id);
  // Trips that fit inside one weekend day; the multi-day ones belong to the trips index.
  const dayTrips = routes.filter((r) => r.duration !== "multi-day");
  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main
        className="tm-stage tm-wk"
        style={{ ["--pin" as string]: `var(--${area.color})` }}
      >
        <div className="tm-sheet tm-wk__sheet">
          <p className="tm-wk__eyebrow">{s.weekendPage.eyebrow}</p>
          <h1 className="tm-h2">{s.weekendPage.title(t(area.name, locale))}</h1>
          <p className="tm-wk__lead">
            {t(area.tagline, locale)}{" "}
            {price
              ? s.weekendPage.budget(
                  thb(price.min, locale),
                  thb(price.max, locale),
                )
              : s.weekendPage.anyBudget}
          </p>
          <StayPicker locale={locale} />
          <div className="tm-wk__actions">
            <button type="button" onClick={share} className="tm-button">
              <Share2 aria-hidden="true" className="size-4" />
              {shared === "copied"
                ? s.weekendPage.copied
                : shared === "failed"
                  ? s.weekendPage.copyFailed
                  : s.weekendPage.share}
            </button>
            {slotDay("fridayNight") && (
              <button
                type="button"
                onClick={addToCalendar}
                className="tm-link tm-link--button"
              >
                <CalendarPlus aria-hidden="true" className="size-4" />
                {s.weekendPage.calendar}
              </button>
            )}
            <Link href={explorerHref} className="tm-link">
              {s.weekendPage.openMap}
            </Link>
            <Link
              href={`/${locale}/${cityId}/area/${area.id}`}
              className="tm-link"
            >
              {s.areaPage.link}
            </Link>
          </div>
          <ol className="tm-wk__slots">
            {WEEKEND_SLOTS.map((slot) => (
              <li key={slot} className="tm-wk__slot">
                <h2 className="tm-wk__time">
                  {s.guide.slots[slot]}
                  {slotDate(slot) && (
                    <span className="tm-wk__date"> · {slotDate(slot)}</span>
                  )}
                </h2>
                {plan.slots[slot].length === 0 ? (
                  <p className="tm-wk__empty">
                    {s.guide.slotEmpty}
                    {" · "}
                    <Link
                      href={`/${locale}/${cityId}#area=${area.id}&time=${SLOT_TIMES[slot].join(",")}`}
                      className="tm-link tm-link--under"
                    >
                      {s.weekendPage.slotEmptyLink}
                    </Link>
                  </p>
                ) : (
                  <ul className="tm-wk__stops">{plan.slots[slot].map(stop)}</ul>
                )}
              </li>
            ))}
            <li className="tm-wk__slot tm-wk__slot--stay">
              <h2 className="tm-wk__time">{s.guide.stay}</h2>
              {hotels.length > 0 && (
                <p
                  className={
                    myHotel ? "tm-wk__empty" : "tm-wk__empty tm-wk__hint"
                  }
                >
                  {myHotel
                    ? s.weekendPage.hotelPicked(t(myHotel.name, locale))
                    : s.weekendPage.pickHotelHint}
                </p>
              )}
              {hotels.length === 0 ? (
                <p className="tm-wk__empty">
                  {s.guide.stayNone}
                  {price && area.pins.some((p) => p.kind === "hotel") && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="tm-link tm-link--under"
                        onClick={() => {
                          setPrice(null);
                          window.history.replaceState(
                            null,
                            "",
                            window.location.pathname + window.location.hash,
                          );
                        }}
                      >
                        {s.weekendPage.showAllHotels}
                      </button>
                    </>
                  )}
                </p>
              ) : (
                <ul className="tm-wk__stops">{hotels.map(stop)}</ul>
              )}
              {hotels.length > 1 && (
                <div className="tm-ar__cmp">
                  <h3 className="tm-wk__time">{s.areaPage.compare}</h3>
                  <p className="tm-saved__note">{s.weekendPage.compareLead}</p>
                  <HotelCompare
                    locale={locale}
                    cityId={cityId}
                    entries={hotels.map((pin) => ({ pin, area }))}
                    stations={stations}
                    nearbyCount={nearbyCount}
                    showArea={false}
                  />
                </div>
              )}
            </li>
          </ol>
          {dayTrips.length > 0 && (
            <section className="tm-wk__others">
              <h2 className="tm-wk__time">{s.weekendPage.dayOut}</h2>
              <p className="tm-wk__empty">{s.weekendPage.dayOutLead}</p>
              <ul className="tm-wk__stops">
                {dayTrips.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/${locale}/${cityId}/trip/${r.id}`}
                      className="tm-wk__stop tm-wk__trip"
                    >
                      <span className="tm-wk__text">
                        <span className="tm-wk__kind">
                          {s.trip.duration[r.duration]} · {s.trip.mode[r.mode]}
                          {r.distanceKm !== undefined
                            ? ` · ${s.trip.km(r.distanceKm)}`
                            : ""}
                        </span>
                        <span className="tm-wk__name">{t(r.name, locale)}</span>
                        <span className="tm-wk__why">
                          {t(r.tagline, locale)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="tm-wk__others">
            <h2 className="tm-wk__time">{s.weekendPage.others}</h2>
            <ul className="tm-wk__other-list">
              {others.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/${locale}/${cityId}/weekend/${a.id}${priceQuery ? `?${priceQuery}` : ""}`}
                    className="tm-weekend__stop"
                    style={{ ["--pin" as string]: `var(--${a.color})` }}
                  >
                    <span aria-hidden="true" className="tm-wk__dot" />
                    {t(a.name, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </div>
        <div className="tm-stage__map" data-ui>
          {detected3D !== null && (
            <StageMap
              locale={locale}
              camera={area.camera}
              threeD={detected3D}
              areas={mapAreas}
              route={null}
              focus={focus}
              card={card}
              onCloseCard={() => setCard(null)}
              hoverPin={hoverId}
              onHoverPin={setHoverId}
              onSelectPin={(pin) => {
                setCard({ pin, area });
              }}
              cityId={cityId}
              stations={stations}
            />
          )}
          <div
            className="tm-stage__bar tm-stage__bar--page"
            data-map-overlay="bottom"
          >
            <span className="tm-stage__showing">
              {s.home.showing(t(area.name, locale))}
            </span>
            {slotDay("fridayNight") && (
              <button
                type="button"
                onClick={addToCalendar}
                className="tm-link tm-link--button"
              >
                <CalendarPlus aria-hidden="true" className="size-4" />
                {s.weekendPage.calendar}
              </button>
            )}
            <Link href={explorerHref} className="tm-link">
              {s.weekendPage.openMap}
            </Link>
          </div>
        </div>
      </main>
      {myHotel && !sentHotel && (
        // Phones: the hearted hotel's booking links stay within reach at the bottom while the plan scrolls.
        <div className="tm-wk__book" data-ui>
          <span className="tm-wk__book-text">
            <span className="tm-wk__book-name">{t(myHotel.name, locale)}</span>
            {myHotel.price && stay && (
              <span
                className="tm-wk__book-total"
                title={
                  myHotel.price.basis === "tier-estimate"
                    ? s.guide.priceEstimate
                    : undefined
                }
              >
                {s.guide.stayTotal(
                  thb(myHotel.price.from * nights(stay), locale),
                  nights(stay),
                )}
                {myHotel.price.basis === "tier-estimate" ? "*" : ""}
              </span>
            )}
          </span>
          {(Object.keys(myHotel.links) as Partner[])
            .filter((p) => p !== "official")
            .map((p) => {
              const subId = subIdFor(`${cityId}-${area.id}`, myHotel.id);
              return (
                <a
                  key={p}
                  href={buildOutboundUrl(p, myHotel.links[p]!, subId, stay)}
                  onClick={() => trackOutbound(p, subId)}
                  target="_blank"
                  rel="noopener sponsored"
                  className="tm-card__link"
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </a>
              );
            })}
        </div>
      )}
    </>
  );
}
