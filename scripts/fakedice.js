/**
 * FakeDice Module for FoundryVTT v13
 * Allows GMs to manipulate dice rolls to meet specific target criteria
 */

class FakeDice {
  static ID = 'fakedice';
  static TEMPLATES = {
    DIALOG: `modules/${this.ID}/templates/fake-dice-dialog.hbs`
  };

  static initialize() {
    this.SETTINGS = {
      ENABLED: 'enabled',
      TARGET: 'target',
      PLAYER_ENABLED: 'playerEnabled'
    };

    // Register module settings
    game.settings.register(this.ID, this.SETTINGS.ENABLED, {
      name: 'FAKEDICE.settings.enabled.name',
      hint: 'FAKEDICE.settings.enabled.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      requiresReload: false
    });

    game.settings.register(this.ID, this.SETTINGS.TARGET, {
      name: 'FAKEDICE.settings.target.name',
      hint: 'FAKEDICE.settings.target.hint',
      scope: 'world',
      config: false,
      type: String,
      default: '>=10'
    });

    game.settings.register(this.ID, this.SETTINGS.PLAYER_ENABLED, {
      name: 'FAKEDICE.settings.playerEnabled.name',
      hint: 'FAKEDICE.settings.playerEnabled.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
      requiresReload: false
    });

    console.log(`${this.ID} | Initialized`);
  }

  static ready() {
    // Only initialize for GMs
    if (!game.user.isGM) return;

    // Add control button to token controls
    this.addControlButton();

    // Also add a macro bar button as alternative access
    this.createMacro();

    // Hook into dice rolls
    this.hookDiceRolls();

    // Add chat command
    this.registerChatCommand();

    console.log(`${this.ID} | Ready - GM controls initialized`);
  }

  static registerChatCommand() {
    // Register chat command
    Hooks.on('chatMessage', (html, content, msg) => {
      if (content === '/fakedice' || content === '/fd') {
        if (!game.user.isGM) {
          ui.notifications.warn("Only GMs can configure FakeDice");
          return false;
        }
        this.showDialog();
        return false; // Prevent the message from being sent to chat
      }
    });
  }

  static async createMacro() {
    // Create a macro for easy access if one doesn't exist
    const existingMacro = game.macros.find(m => m.name === "FakeDice Config");
    if (!existingMacro) {
      await Macro.create({
        name: "FakeDice Config",
        type: "script",
        img: "icons/dice/d20black.svg",
        command: "FakeDice.showDialog();",
        flags: { "fakedice.generated": true }
      });
      ui.notifications.info("FakeDice: Configuration macro created in your macro bar!");
    }
  }

  static addControlButton() {
    // Add button to scene controls
    Hooks.on('getSceneControlButtons', (controls) => {
      if (!game.user.isGM) return;

      // Add to the notes layer instead of token layer for better visibility
      const notesControls = controls.find(c => c.name === 'notes');
      if (notesControls) {
        notesControls.tools.push({
          name: 'fakedice',
          title: game.i18n.localize('FAKEDICE.controls.title'),
          icon: 'fas fa-dice-d20',
          onClick: () => this.showDialog(),
          toggle: true,
          active: game.settings.get(this.ID, this.SETTINGS.ENABLED),
          button: true
        });
      }
    });
  }

  static hookDiceRolls() {
    // Hook into dice roll evaluation
    Hooks.on('preCreateChatMessage', (message, data, options, userId) => {
      if (!this.shouldModifyRoll(userId)) return;

      const roll = message.rolls?.[0];
      if (!roll) return;

      try {
        this.modifyRoll(roll);
      } catch (error) {
        console.error(`${this.ID} | Error modifying roll:`, error);
      }
    });
  }

  static shouldModifyRoll(userId) {
    const enabled = game.settings.get(this.ID, this.SETTINGS.ENABLED);
    const playerEnabled = game.settings.get(this.ID, this.SETTINGS.PLAYER_ENABLED);
    const user = game.users.get(userId);

    // If module is disabled, don't modify
    if (!enabled) return false;

    // If user is GM, always allow modification when enabled
    if (user.isGM) return true;

    // For players, check if player modification is enabled
    return playerEnabled;
  }

  static modifyRoll(roll) {
    const target = game.settings.get(this.ID, this.SETTINGS.TARGET);
    if (!target) return;

    const { operator, value } = this.parseTarget(target);
    if (!operator || value === null) return;

    // Modify each die result
    roll.dice.forEach(die => {
      die.results.forEach(result => {
        const newValue = this.generateTargetValue(die.faces, operator, value);
        if (newValue !== null) {
          result.result = newValue;
        }
      });
    });

    // Recalculate total
    roll._total = roll._evaluateTotal();
  }

  static parseTarget(target) {
    const match = target.match(/^(>=|<=|>|<|=)(\d+)$/);
    if (!match) return { operator: null, value: null };

    return {
      operator: match[1],
      value: parseInt(match[2])
    };
  }

  static generateTargetValue(faces, operator, targetValue) {
    const possibleValues = [];
    
    for (let i = 1; i <= faces; i++) {
      if (this.meetsTarget(i, operator, targetValue)) {
        possibleValues.push(i);
      }
    }

    if (possibleValues.length === 0) return null;

    // Return a random value from the possible values
    return possibleValues[Math.floor(Math.random() * possibleValues.length)];
  }

  static meetsTarget(value, operator, target) {
    switch (operator) {
      case '=': return value === target;
      case '>': return value > target;
      case '>=': return value >= target;
      case '<': return value < target;
      case '<=': return value <= target;
      default: return false;
    }
  }

  static async showDialog() {
    const currentTarget = game.settings.get(this.ID, this.SETTINGS.TARGET);
    const isEnabled = game.settings.get(this.ID, this.SETTINGS.ENABLED);
    const isPlayerEnabled = game.settings.get(this.ID, this.SETTINGS.PLAYER_ENABLED);

    const content = `
      <div class="fakedice-dialog">
        <div class="form-group">
          <label for="fakedice-target">${game.i18n.localize('FAKEDICE.dialog.target')}</label>
          <input type="text" id="fakedice-target" value="${currentTarget}" placeholder=">=10">
          <p class="notes">${game.i18n.localize('FAKEDICE.dialog.targetHint')}</p>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="fakedice-enabled" ${isEnabled ? 'checked' : ''}>
            ${game.i18n.localize('FAKEDICE.dialog.enabled')}
          </label>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="fakedice-player-enabled" ${isPlayerEnabled ? 'checked' : ''}>
            ${game.i18n.localize('FAKEDICE.dialog.playerEnabled')}
          </label>
        </div>
      </div>
    `;

    new Dialog({
      title: game.i18n.localize('FAKEDICE.dialog.title'),
      content: content,
      buttons: {
        save: {
          label: game.i18n.localize('FAKEDICE.dialog.save'),
          callback: (html) => {
            const target = html.find('#fakedice-target').val();
            const enabled = html.find('#fakedice-enabled').prop('checked');
            const playerEnabled = html.find('#fakedice-player-enabled').prop('checked');

            game.settings.set(this.ID, this.SETTINGS.TARGET, target);
            game.settings.set(this.ID, this.SETTINGS.ENABLED, enabled);
            game.settings.set(this.ID, this.SETTINGS.PLAYER_ENABLED, playerEnabled);

            ui.notifications.info(game.i18n.localize('FAKEDICE.notifications.saved'));
            
            // Update control button state
            this.updateControlButton(enabled);
          }
        },
        cancel: {
          label: game.i18n.localize('FAKEDICE.dialog.cancel')
        }
      },
      default: 'save'
    }).render(true);
  }

  static updateControlButton(enabled) {
    const control = ui.controls.control;
    if (control) {
      const tool = control.tools.find(t => t.name === 'fakedice');
      if (tool) {
        tool.active = enabled;
        ui.controls.render();
      }
    }
  }
}

// Initialize module
Hooks.once('init', () => {
  FakeDice.initialize();
});

Hooks.once('ready', () => {
  FakeDice.ready();
});

// Make the class globally available for debugging
window.FakeDice = FakeDice;
