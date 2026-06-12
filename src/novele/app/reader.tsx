import van from "vanjs-core";
import nameMap from "./style.module.scss";
import {
    Direction,
    HorizonDir,
    IconChevron,
    IconPanel,
    PanelState,
} from "../../style/icon";
import { TextField } from "./component/text-field";
import { BottomBar } from "./bottom-bar";
import { resolveLinks, subscribeLinks } from "../core/extract/links";
import { queueChapterFetch, updateCurrentPage } from "../core/queue";
import { getChapter } from "../core/extract/chapters";
import { findPage } from "../core/extract/pages";
import { nav } from "../core/nav";

const { button, div, p, input } = van.tags;

const content = van.state([
    "Testing text",
    "In the heart of the bustling city, where the streets were alive with the sounds of laughter and the aroma of street food wafted through the air, there was a small café that seemed to exist in its own world. The walls were adorned with vibrant art, and the soft melodies of a piano could be heard as patrons sipped their coffee, lost in conversation or deep in thought.",
    "As the sun began to set, casting a warm golden hue over the horizon, the city transformed. The skyscrapers glistened against the fading light, and the nightlife began to awaken. People poured into the streets, eager to experience the energy that only the night could bring, filled with anticipation of the adventures that lay ahead.",
    "Amidst the chaos, a young artist sat  alone at a corner table, sketching the world around her. Each stroke of her pencil captured the essence of the moment, a fleeting glimpse of life that would soon be forgotten. She found solace in her art, a way to express the emotions that often felt too heavy to bear.",
    div(
        (() => {
            const _arr = [];
            for (let _state = 0; _state < 3; _state++)
                for (let _dir = 0; _dir < 4; _dir++)
                    _arr.push(
                        div(
                            { class: `${nameMap.icon} ${nameMap.demo}` },
                            IconPanel(_dir, _state),
                        ),
                    );
            return _arr;
        })(),
    ),
    div(
        TextField({
            label: "Title",
        }),
    ),
]);

export const Reader = () => {
    const chapters = van.state<Map<number, string[]>>(new Map());
    const queuedLinks = new Set<string>();

    // Initialize chapters and content
    van.derive(() => {
        const unsubscribe = subscribeLinks((links) => {
            links.forEach((link, index) => {
                if (queuedLinks.has(link.url)) return;
                queuedLinks.add(link.url);
                queueChapterFetch(link, index).then((content) => {
                    chapters.val = new Map(chapters.val.set(index, content));
                });
            });
        });
        void resolveLinks(document);
        return unsubscribe;
    });

    // Update queue priority when current chapter changes
    van.derive(() => {
        updateCurrentPage(nav.index.val);
    });

    // Render the current chapter's content
    const chapterContent = van.derive(() => {
        try {
            const pages = getChapter(nav.index.val).pages;
            const content: string[] = pages.flatMap(url =>
                findPage(url).content || []
            );
            return content || [];
        } catch (error) {
            console.error(`Error fetching chapter ${nav.index.val}:`, error);
            return [];
        }
    });

    return div(
        { class: nameMap.reader },
        () => div({ class: nameMap.content },
            chapterContent.val.map((text, index) => p({ key: index, class: nameMap.text }, text),)),
        BottomBar(),
    );
};
