import DefaultTheme from "vitepress/theme";
import Home from "../../theme/components/Home.vue";

export default {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component("Home", Home);
    },
};
