# Contributing to Web Chat

Thank you for considering contributing to Web Chat!

---

# Issues and Suggestions

Bug reports and feature requests are welcome!
Before creating a GitHub issue or pull request (PR), please check if the issue or idea has already been discussed.
Feel free to open a discussion or issue to talk about your ideas first.

---

# Contributing code

## Contribution Tips

- **Ask Before Starting**: If you're planning to work on a significant change, open an issue or discussion to ensure alignment with the project's direction. There is nothing worse than investing time in something to only realize it will not be accepted or significant reworking is needed that could be avoided.
- **Keep Changes Small**: Submit focused pull requests that address one issue or feature at a time.
- **Be Patient**: Reviews might take some time. Your patience and understanding are appreciated!

## Environment Setup

### Prerequisites

To contribute to this project, you'll need the following tools installed:

- [Node.js](https://nodejs.org/en/) Note: Also required when doing Java development as this project uses the prettier java plugin for formatting.
- [Java Development Kit (JDK)](https://adoptium.net) Version: 21
- A code editor like [VS Code](https://code.visualstudio.com/) or [IntelliJ IDEA](https://www.jetbrains.com/idea/) with:
    - Nice to have: Prettier extension/plugin support, to ensure consistent formatting. Without it you will need to run prettier from the commandline before creating a PR.
    - TypeScript support (for the `ts-check` annotations in `.mjs` files)

### Recommended plugins - VSCode:

- [EditorConfig for VS Code](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
- [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack)
- [Lombok annotions Support](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-lombok)
- [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) Important, you need to configure VScode to use this as a formatter. It is highly recommended to also set VSCode to format on save.
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

### Recommended plugins - IntelliJ

Note:
The situation around IntelliJ is a bit more complex as the community edition only properly supports Java development. If you don't have access to IntelliJ IDEA Ultimate and don't want to use VSCode you can run the community edition and webstorm side by side.

- [Lombok](https://plugins.jetbrains.com/plugin/6317-lombok)
- [Minecraft Development](https://plugins.jetbrains.com/plugin/8327-minecraft-development)
- Ultimate/Webstorm only: [Prettier](https://plugins.jetbrains.com/plugin/10456-prettier) Important, you need to [configure Intellij](https://www.jetbrains.com/help/webstorm/prettier.html#ws_prettier_configure) to use this as a formatter. It is highly recommended to also set the `Run on save` setting.

### Scripts

Here are some useful commands for development:

- **Run eslint**:

    ```sh
    npm run eslint
    ```

- **Run prettier**:

    ```sh
    npm run prettier
    ```

- **Running Vitest**, used to test minecraft JSON chat message parsing:

    ```sh
    npm test
    ```

- **Build the Minecraft mod**:

    ```sh
    ./gradlew clean build
    ```

## Coding Guidelines

### General Guidelines

- **Code Style**: This project uses Prettier for formatting and ESLint for linting. Make sure your code passes both before submitting a PR.
- **TypeScript Annotations**: The `.mjs` files use `@ts-check` for type checking. Ensure any changes maintain proper type annotations.
- **Use early returns**: Early returns make code easier to follow.
- **Always use brackets for statements**: This is done for consistency reasons.  
      
    _bad_:
    ```js
    if (condition) return;
    ```
    _good_:
    ```js
    if (condition) {
        return;
    }
    ```

### Java-Specific Guidelines

- Follow the conventions enforced by the `prettier-plugin-java` plugin.

### Submitting Pull Requests

1. Before starting work on a new feature or bug fix, **open an issue or discussion** making sure the change aligns with the project goals.
2. Fork the repository and create a new branch for your work.
3. Make your changes. Ensure the code is well documented and tested.
    - Unit tests: Currently on for `src/client/resources/web/js/message_parsing.js`.
    - Manual validation: Make sure the mod builds and works in both a singleplayer (LAN) world and actual server.
4. Submit a pull request with a clear description of your changes.

## Project Structure

- **`src/client/java/`**: The Java source code for the Minecraft mod.
- **`src/client/resources/`**: Includes static files like HTML, CSS, and JavaScript for the web chat.
- **`web/`**: Contains the core web files:
    - `index.html`: The main page.
    - `css/`: Styling.
    - `js/`: Javascript logic.
- **`build/`**: Generated files after building the mod.
    - `libs/`: The generated jar

---

# Other resources:

- [Fabric develop](https://fabricmc.net/develop/) use this to get the latest Javadoc and other documentation.

---

# Need Help?

If you have any questions or need guidance, feel free to open an issue or discussion on GitHub. Feel free to reach out for help!
