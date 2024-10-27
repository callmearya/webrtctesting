export default {
  build: {
    rollupOptions: {
      external: ['main.js']
    }
  }
}

// vite.config.js
export default {
  build: {
    rollupOptions: {
      external: ['style.css']
    }
  }
}
