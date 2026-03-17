from __future__ import annotations

import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.discovery.drivers.base import BaseDriver

# Lazy-loaded registry: driver_class_str -> class
_REGISTRY: dict[str, type] = {}


def _lazy_load() -> None:
    """Load built-in drivers into the registry."""
    global _REGISTRY
    if _REGISTRY:
        return
    try:
        from app.discovery.drivers.cisco_ios import CiscoIosDriver
        _REGISTRY["cisco_ios"] = CiscoIosDriver
    except ImportError:
        pass
    try:
        from app.discovery.drivers.unifi import UnifiDriver
        _REGISTRY["unifi"] = UnifiDriver
    except ImportError:
        pass


# Public alias for drivers that may be imported directly
VENDOR_DRIVERS: dict[str, type] = _REGISTRY


def get_driver(driver_class: str) -> type["BaseDriver"]:
    """Return the driver class for the given driver_class string.

    Tries the built-in registry first, then attempts a dynamic import
    using dotted module path (e.g. "myapp.drivers.custom.MyDriver").
    """
    _lazy_load()

    if driver_class in _REGISTRY:
        return _REGISTRY[driver_class]

    # Try dynamic import (module.ClassName)
    if "." in driver_class:
        module_path, class_name = driver_class.rsplit(".", 1)
        try:
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            _REGISTRY[driver_class] = cls
            return cls
        except (ImportError, AttributeError) as exc:
            raise ValueError(
                f"Cannot load driver class '{driver_class}': {exc}"
            ) from exc

    raise ValueError(
        f"Unknown driver class '{driver_class}'. "
        f"Available: {list(_REGISTRY.keys())}"
    )


def register_driver(name: str, cls: type) -> None:
    """Register a custom driver class."""
    _lazy_load()
    _REGISTRY[name] = cls
